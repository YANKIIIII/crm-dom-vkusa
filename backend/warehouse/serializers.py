from rest_framework import serializers
from .models import StockItem

class StockItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product_card.name', read_only=True)
    product_sku = serializers.CharField(source='product_card.sku', read_only=True)

    class Meta:
        model = StockItem
        fields = '__all__'
        extra_kwargs = {'stock_tag': {'read_only': True}}

