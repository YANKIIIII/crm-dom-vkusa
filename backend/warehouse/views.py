from rest_framework import viewsets
from common.permissions import IsManagerOrReadOnly
from .models import StockItem
from .serializers import StockItemSerializer



class StockItemViewSet(viewsets.ModelViewSet):
    queryset = StockItem.objects.select_related(
        'product_card', 'product_card__category', 'product_card__supplier'
    ).order_by('id')
    serializer_class = StockItemSerializer
    permission_classes = [IsManagerOrReadOnly]
    filterset_fields = ['stock_tag', 'product_card']
    search_fields = ['product_card__name', 'product_card__sku', 'product_card__category__name', 'product_card__supplier__name']


