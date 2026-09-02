from rest_framework import serializers
from common.slugs import next_letter_code
from .models import ProductCategory, Supplier, ProductCard

class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = '__all__'
        extra_kwargs = {
            'code': {'required': False},
        }

    def create(self, validated_data):
        if not (validated_data.get('code') or '').strip():
            used = ProductCategory.objects.values_list('code', flat=True)
            validated_data['code'] = next_letter_code(used)
        else:
            validated_data['code'] = validated_data['code'].strip().upper()
        return super().create(validated_data)

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'

class ProductCardSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_code = serializers.CharField(source='category.code', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = ProductCard
        fields = '__all__'

