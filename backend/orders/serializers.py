from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers
from .models import (
    ALLOWED_STATUS_TRANSITIONS,
    Order,
    OrderItem,
    OrderPayment,
    OrderDelivery,
    SalesChannel,
    PaymentType,
    DeliveryService,
)

class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product_card.name', read_only=True)
    product_sku = serializers.CharField(source='product_card.sku', read_only=True)
    product_category_name = serializers.CharField(source='product_card.category.name', read_only=True)
    product_grill_type = serializers.CharField(source='product_card.grill_type', read_only=True, allow_null=True)
    product_dimensions = serializers.CharField(source='product_card.dimensions', read_only=True)
    product_weight = serializers.DecimalField(
        source='product_card.weight', max_digits=8, decimal_places=2, read_only=True, allow_null=True,
    )
    product_rrp = serializers.DecimalField(
        source='product_card.rrp', max_digits=12, decimal_places=2, read_only=True, allow_null=True,
    )
    product_supplier_name = serializers.CharField(source='product_card.supplier.name', read_only=True)
    price_with_vat = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = '__all__'

class OrderPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderPayment
        fields = '__all__'

    def validate(self, attrs):
        amount = attrs.get('amount')
        if amount is None and self.instance is not None:
            amount = self.instance.amount

        if amount is not None and amount <= Decimal('0'):
            raise serializers.ValidationError(
                {'amount': 'Сумма платежа должна быть больше нуля.'}
            )

        order = attrs.get('order')
        if order is None and self.instance is not None:
            order = self.instance.order

        if order is None:
            return attrs

        if order.status in (Order.Status.COMPLETED, Order.Status.CANCELLED):
            raise serializers.ValidationError(
                'Нельзя добавлять или изменять платежи для завершённого или отменённого заказа.'
            )

        if amount is not None:
            existing = OrderPayment.objects.filter(order=order)
            if self.instance is not None:
                existing = existing.exclude(pk=self.instance.pk)
            paid = existing.aggregate(total=Sum('amount'))['total'] or Decimal('0')
            order_total = order.total_amount
            tolerance = Decimal('0.01')
            if paid + amount > order_total + tolerance:
                raise serializers.ValidationError(
                    f'Сумма платежей ({paid + amount}) превышает сумму заказа ({order_total}).'
                )

        return attrs


class OrderDeliverySerializer(serializers.ModelSerializer):
    delivery_service_name = serializers.CharField(source='delivery_service.name', read_only=True)

    class Meta:
        model = OrderDelivery
        fields = '__all__'


def _primary_phone(client):
    if client is None:
        return None
    phones = list(client.phones.all())
    if not phones:
        return None
    for phone in phones:
        if phone.is_primary:
            return phone
    return phones[0]


class OrderSerializer(serializers.ModelSerializer):
    seller_name = serializers.CharField(
        source='seller.first_name', read_only=True, allow_null=True, default=None
    )
    client_name = serializers.CharField(source='client.first_name', read_only=True)
    client_last_name = serializers.CharField(source='client.last_name', read_only=True)
    client_phone = serializers.SerializerMethodField()
    client_phone_id = serializers.SerializerMethodField()
    sales_channel_name = serializers.CharField(
        source='sales_channel.name', read_only=True, allow_null=True, default=None
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    total = serializers.DecimalField(source='total_amount', max_digits=12, decimal_places=2, read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    payments = OrderPaymentSerializer(many=True, read_only=True)
    deliveries = OrderDeliverySerializer(many=True, read_only=True)
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
            'client_phone',
            'client_phone_id',
            'sales_channel_name',
            'status_display',
            'total',
            'items',
            'payments',
            'deliveries',
        )
        extra_kwargs = {
            'order_number': {'required': False},
            'seller': {'required': False, 'allow_null': True},
            'sales_channel': {'required': False, 'allow_null': True},
        }

    def get_client_phone(self, obj):
        phone = _primary_phone(obj.client)
        return phone.number if phone else None

    def get_client_phone_id(self, obj):
        phone = _primary_phone(obj.client)
        return phone.pk if phone else None

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
