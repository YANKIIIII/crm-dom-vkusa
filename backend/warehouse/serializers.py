from rest_framework import serializers
from .models import StockItem

class StockItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product_card.name', read_only=True)
    product_sku = serializers.CharField(source='product_card.sku', read_only=True)
    category_name = serializers.CharField(source='product_card.category.name', read_only=True)
    min_stock = serializers.IntegerField(source='product_card.min_stock', read_only=True)
    rrp = serializers.DecimalField(
        source='product_card.rrp', max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = StockItem
        fields = '__all__'
        extra_kwargs = {'stock_tag': {'read_only': True}}

