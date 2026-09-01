from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import django_filters
from common.audit import write_audit
from .models import StockItem
from .serializers import StockItemSerializer


class StockItemFilter(django_filters.FilterSet):
    category = django_filters.NumberFilter(field_name='product_card__category_id')
    expiry_after = django_filters.DateFilter(field_name='expiry_date', lookup_expr='gte')
    expiry_before = django_filters.DateFilter(field_name='expiry_date', lookup_expr='lte')
    stock_min = django_filters.NumberFilter(field_name='stock_quantity', lookup_expr='gte')
    stock_max = django_filters.NumberFilter(field_name='stock_quantity', lookup_expr='lte')

    class Meta:
        model = StockItem
        fields = ['stock_tag', 'product_card', 'category']


class StockItemViewSet(viewsets.ModelViewSet):
    queryset = StockItem.objects.select_related(
        'product_card', 'product_card__category', 'product_card__supplier'
    ).order_by('id')
    serializer_class = StockItemSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = StockItemFilter
    search_fields = ['product_card__name', 'product_card__sku', 'product_card__category__name', 'product_card__supplier__name']
    ordering_fields = [
        'id', 'stock_quantity', 'expiry_date', 'stock_tag',
        'product_card__sku', 'product_card__name', 'product_card__min_stock', 'product_card__rrp',
        'product_card__category__name',
    ]
    ordering = ['id']

    def create(self, request, *args, **kwargs):
        product_card_id = request.data.get('product_card')
        if product_card_id in (None, ''):
            return super().create(request, *args, **kwargs)
        with transaction.atomic():
            existing = (
                StockItem.objects.select_for_update()
                .filter(product_card_id=product_card_id)
                .order_by('id')
                .first()
            )
            if existing is None:
                return super().create(request, *args, **kwargs)
            try:
                add = int(request.data.get('stock_quantity') or 0)
            except (TypeError, ValueError):
                add = 0
            existing.stock_quantity = existing.stock_quantity + max(add, 0)
            expiry = request.data.get('expiry_date')
            if expiry not in (None, ''):
                existing.expiry_date = expiry
            existing.save()
            write_audit(
                request.user,
                'UPDATE',
                'stock_item',
                existing.pk,
                details={'stock_quantity': existing.stock_quantity, 'receipt': add},
            )
            serializer = self.get_serializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'CREATE', 'stock_item', instance.pk)

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit(
            self.request.user,
            'UPDATE',
            'stock_item',
            instance.pk,
            details={'stock_quantity': instance.stock_quantity},
        )

    def perform_destroy(self, instance):
        pk = instance.pk
        instance.delete()
        write_audit(self.request.user, 'DELETE', 'stock_item', pk)


