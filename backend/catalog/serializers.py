from django.db.models import Max
from rest_framework import serializers
from common.slugs import next_letter_code, unique_slug
from .models import GrillType, ProductCategory, Supplier, ProductCard


def normalize_grill_type(value):
    if value in (None, ''):
        return None
    if not GrillType.objects.filter(code=value).exists():
        raise serializers.ValidationError('Неизвестный тип гриля.')
    return value


class GrillTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = GrillType
        fields = ['id', 'code', 'name', 'sort_order']
        read_only_fields = ['code', 'sort_order']

    def create(self, validated_data):
        validated_data['code'] = unique_slug(
            validated_data.get('name', ''),
            lambda code: GrillType.objects.filter(code=code).exists(),
            fallback='grill',
        )
        current_max = GrillType.objects.aggregate(m=Max('sort_order'))['m'] or 0
        validated_data['sort_order'] = current_max + 10
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('code', None)
        validated_data.pop('sort_order', None)
        return super().update(instance, validated_data)


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
    grill_type_name = serializers.SerializerMethodField()

    class Meta:
        model = ProductCard
        fields = '__all__'

    def get_grill_type_name(self, obj):
        code = obj.grill_type
        if not code:
            return ''
        labels = self.context.get('grill_type_labels')
        if labels is None:
            labels = GrillType.label_map()
        return labels.get(code) or ''

    def validate_grill_type(self, value):
        return normalize_grill_type(value)

