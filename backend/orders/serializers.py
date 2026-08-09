from rest_framework import serializers
from .models import (
    ALLOWED_STATUS_TRANSITIONS,
    Order,
    OrderItem,
    OrderPayment,
    SalesChannel,
    PaymentType,
    DeliveryService,
)

class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product_card.name', read_only=True)
    product_sku = serializers.CharField(source='product_card.sku', read_only=True)
    price_with_vat = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = '__all__'

class OrderSerializer(serializers.ModelSerializer):
    seller_name = serializers.CharField(source='seller.first_name', read_only=True)
    client_name = serializers.CharField(source='client.first_name', read_only=True)
    client_last_name = serializers.CharField(source='client.last_name', read_only=True)
    sales_channel_name = serializers.CharField(source='sales_channel.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    total = serializers.DecimalField(source='total_amount', max_digits=12, decimal_places=2, read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    
    class Meta:
        model = Order
        fields = '__all__'
        read_only_fields = (
            'created_by',
            'completed_at',
            'created_at',
            'updated_at',
            'seller_name',
            'client_name',
            'client_last_name',
            'sales_channel_name',
            'status_display',
            'total',
            'items',
        )
        extra_kwargs = {
            'order_number': {'required': False},
            'seller': {'required': False},
        }

    def validate_status(self, value):
        # Creation may start at any status; the state machine applies only on update.
        if self.instance is None:
            return value
        old_status = self.instance.status
        if value == old_status:
            return value
        if value not in ALLOWED_STATUS_TRANSITIONS.get(old_status, ()):
            old_label = Order.Status(old_status).label
            new_label = Order.Status(value).label
            raise serializers.ValidationError(
                f"Недопустимый переход статуса: '{old_label}' -> '{new_label}'."
            )
        return value

class OrderPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderPayment
        fields = '__all__'

class SalesChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesChannel
        fields = '__all__'

class PaymentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentType
        fields = '__all__'

class DeliveryServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryService
        fields = '__all__'

