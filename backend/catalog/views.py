from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from common.audit import write_audit
from common.permissions import IsManagerOrReadOnly
from .models import ProductCategory, Supplier, ProductCard
from .serializers import ProductCategorySerializer, SupplierSerializer, ProductCardSerializer

class ProductCategoryViewSet(viewsets.ModelViewSet):
    queryset = ProductCategory.objects.order_by('code')
    serializer_class = ProductCategorySerializer
    permission_classes = [IsManagerOrReadOnly]

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.order_by('name')
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
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

from django.db.models import Case, When, Value, CharField

class ProductCardViewSet(viewsets.ModelViewSet):
    queryset = ProductCard.objects.select_related('category', 'supplier').order_by('id')
    serializer_class = ProductCardSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['category', 'supplier', 'grill_type']
    search_fields = ['name', 'sku', 'category__name', 'supplier__name', 'grill_type_name']
    ordering_fields = ['id', 'sku', 'name', 'rrp', 'base_cost_price', 'category__name', 'supplier__name']
    ordering = ['id']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.annotate(
            grill_type_name=Case(
                When(grill_type='charcoal', then=Value('Угольный')),
                When(grill_type='gas', then=Value('Газовый')),
                When(grill_type='ceramic', then=Value('Керамический')),
                When(grill_type='electric', then=Value('Электрический')),
                When(grill_type='pellet', then=Value('Пеллетный')),
                default=Value(''),
                output_field=CharField()
            )
        )

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

