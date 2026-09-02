from django.db.models import CharField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
import django_filters
from clients.models import Client
from common.audit import write_audit
from common.permissions import CatalogCardPermission, HasAnyModule, HasModuleOrReadOnly
from common.views import RestrictedDeleteMixin
from .models import GrillType, ProductCategory, Supplier, ProductCard
from .serializers import (
    GrillTypeSerializer, ProductCategorySerializer, SupplierSerializer, ProductCardSerializer,
)


class GrillTypeViewSet(viewsets.ModelViewSet):
    queryset = GrillType.objects.order_by('sort_order', 'id')
    serializer_class = GrillTypeSerializer
    permission_classes = [HasModuleOrReadOnly('references')]

    def perform_destroy(self, instance):
        if ProductCard.objects.filter(grill_type=instance.code).exists():
            raise ValidationError('Нельзя удалить: тип используется в товарах.')
        if Client.objects.filter(grill_type=instance.code).exists():
            raise ValidationError('Нельзя удалить: тип используется у клиентов.')
        instance.delete()


class ProductCategoryViewSet(RestrictedDeleteMixin, viewsets.ModelViewSet):
    queryset = ProductCategory.objects.order_by('code')
    serializer_class = ProductCategorySerializer
    permission_classes = [HasModuleOrReadOnly('references')]

class SupplierViewSet(RestrictedDeleteMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.order_by('name')
    serializer_class = SupplierSerializer
    permission_classes = [HasAnyModule('warehouse', 'orders', 'references')]
    search_fields = ['name', 'contact_person', 'phone', 'email']

    def create(self, request, *args, **kwargs):
        name = (request.data.get('name') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        existing = None
        if name:
            existing = Supplier.objects.filter(name__iexact=name).first()
        if existing is None and phone:
            existing = Supplier.objects.filter(phone=phone).exclude(phone='').first()
        if existing is None:
            return super().create(request, *args, **kwargs)
        if phone and not (existing.phone or '').strip():
            existing.phone = phone
            existing.save(update_fields=['phone'])
        serializer = self.get_serializer(existing)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProductCardFilter(django_filters.FilterSet):
    rrp_min = django_filters.NumberFilter(field_name='rrp', lookup_expr='gte')
    rrp_max = django_filters.NumberFilter(field_name='rrp', lookup_expr='lte')

    class Meta:
        model = ProductCard
        fields = ['category', 'supplier', 'grill_type']


class ProductCardViewSet(viewsets.ModelViewSet):
    queryset = ProductCard.objects.select_related('category', 'supplier').order_by('id')
    serializer_class = ProductCardSerializer
    permission_classes = [CatalogCardPermission]
    filterset_class = ProductCardFilter
    search_fields = ['name', 'sku', 'category__name', 'supplier__name', 'grill_type_name']
    ordering_fields = ['id', 'sku', 'name', 'rrp', 'base_cost_price', 'category__name', 'supplier__name']
    ordering = ['id']

    def get_queryset(self):
        qs = super().get_queryset()
        name_sub = GrillType.objects.filter(code=OuterRef('grill_type')).values('name')[:1]
        return qs.annotate(
            grill_type_name=Coalesce(Subquery(name_sub), Value(''), output_field=CharField())
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['grill_type_labels'] = GrillType.label_map()
        return ctx

    def perform_create(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'CREATE', 'product_card', instance.pk)

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'UPDATE', 'product_card', instance.pk)

    def perform_destroy(self, instance):
        pk = instance.pk
        instance.delete()
        write_audit(self.request.user, 'DELETE', 'product_card', pk)

