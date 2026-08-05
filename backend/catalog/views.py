from rest_framework import viewsets
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
    permission_classes = [IsManagerOrReadOnly]

from django.db.models import Case, When, Value, CharField

class ProductCardViewSet(viewsets.ModelViewSet):
    queryset = ProductCard.objects.select_related('category', 'supplier').order_by('id')
    serializer_class = ProductCardSerializer
    permission_classes = [IsManagerOrReadOnly]
    filterset_fields = ['category', 'supplier', 'grill_type']
    search_fields = ['name', 'sku', 'category__name', 'supplier__name', 'grill_type_name']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.annotate(
            grill_type_name=Case(
                When(grill_type='charcoal', then=Value('Угольный')),
                When(grill_type='gas', then=Value('Газовый')),
                When(grill_type='ceramic', then=Value('Керамический')),
                default=Value(''),
                output_field=CharField()
            )
        )

