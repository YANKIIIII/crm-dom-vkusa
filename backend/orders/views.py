from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
import django_filters
from common.audit import write_audit
from common.permissions import HasAnyModule, HasModule, HasModuleOrReadOnly
from clients.services import ClientService
from warehouse.services import WarehouseService
from common.views import RestrictedDeleteMixin
from .models import (
    Order,
    OrderItem,
    OrderPayment,
    OrderDelivery,
    OrderStatus,
    SalesChannel,
    PaymentType,
    DeliveryService,
    is_completed_status,
    is_terminal_status,
)
from .serializers import (
    OrderSerializer,
    OrderItemSerializer,
    OrderPaymentSerializer,
    OrderDeliverySerializer,
    OrderStatusSerializer,
    SalesChannelSerializer,
    PaymentTypeSerializer,
    DeliveryServiceSerializer,
)


class OrderFilter(django_filters.FilterSet):
    order_date_after = django_filters.DateFilter(field_name='order_date', lookup_expr='gte')
    order_date_before = django_filters.DateFilter(field_name='order_date', lookup_expr='lte')

    class Meta:
        model = Order
        fields = ['status', 'seller', 'sales_channel', 'client']


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related(
        'seller', 'sales_channel', 'client', 'delivery_service'
    ).prefetch_related(
        'client__phones',
        'deliveries__delivery_service',
        'items__product_card__category', 'items__product_card__supplier', 'payments__payment_type'
    ).order_by('-id')
    serializer_class = OrderSerializer
    permission_classes = [HasModule('orders')]
    filterset_class = OrderFilter
    search_fields = [
        'order_number', 'tracking_number', 'client__first_name', 'client__last_name', 'client__email', 'client__phones__number',
        'items__product_card__name', 'items__product_card__sku', 'items__product_card__category__name', 'items__product_card__supplier__name',
    ]
    ordering_fields = [
        'id', 'order_number', 'order_date', 'status', 'discount_percent',
        'seller__first_name', 'client__last_name', 'client__first_name',
    ]
    ordering = ['-id']

    def get_queryset(self):
        return super().get_queryset()

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            serializer.save(seller=user, created_by=user)
        else:
            client = serializer.validated_data.get('client')
            if client is not None and serializer.validated_data.get('seller') is None:
                serializer.save(created_by=user, seller=client.seller)
            else:
                serializer.save(created_by=user)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        # Lock before validate_status so transitions use fresh DB status, not a stale get_object().
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        # Plain Order table lock: get_queryset() has select_related/prefetch that Postgres rejects with FOR UPDATE on outer joins.
        locked = Order.objects.select_for_update().get(pk=instance.pk)
        serializer = self.get_serializer(locked, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(locked, '_prefetched_objects_cache', None):
            locked._prefetched_objects_cache = {}

        return Response(serializer.data)

    @transaction.atomic
    def perform_update(self, serializer):
        user = self.request.user
        if getattr(user, 'role', None) == 'seller':
            serializer.validated_data.pop('seller', None)
        old_status = serializer.instance.status
        instance = serializer.save()
        if is_completed_status(instance.status) and not is_completed_status(old_status):
            WarehouseService.deduct_items(instance)

    def destroy(self, request, *args, **kwargs):
        if hasattr(request.user, 'role') and request.user.role == 'seller':
            raise PermissionDenied("Продавцы не могут удалять заказы.")
        return super().destroy(request, *args, **kwargs)

    @transaction.atomic
    def perform_destroy(self, instance):
        if is_completed_status(instance.status):
            raise ValidationError("Нельзя удалить завершённый заказ.")
        pk = instance.pk
        details = {
            'order_number': instance.order_number,
            'old': {'status': instance.status},
            'new': None,
        }
        instance.delete()
        write_audit(self.request.user, 'DELETE', 'order', pk, details=details)

def _ensure_order_active(order):
    """Состав терминального заказа неизменяем: отмена уже вернула товар на
    склад, завершение означает продажу — любые мутации позиций разойдутся
    с остатками."""
    if is_terminal_status(order.status):
        raise ValidationError(
            "Нельзя изменять состав завершённого или отменённого заказа."
        )


def _recheck_payment_against_locked_order(order, amount, exclude_payment_pk=None):
    """Re-validate terminal status and overpay against a locked order row."""
    if is_terminal_status(order.status):
        raise ValidationError(
            "Нельзя добавлять или изменять платежи для завершённого или отменённого заказа."
        )
    if amount is None:
        return
    existing = OrderPayment.objects.filter(order=order)
    if exclude_payment_pk is not None:
        existing = existing.exclude(pk=exclude_payment_pk)
    paid = existing.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    tolerance = Decimal('0.01')
    if paid + amount > order.total_amount + tolerance:
        raise ValidationError(
            f'Сумма платежей ({paid + amount}) превышает сумму заказа ({order.total_amount}).'
        )


class OrderItemViewSet(viewsets.ModelViewSet):
    queryset = OrderItem.objects.select_related('order', 'product_card').order_by('id')
    serializer_class = OrderItemSerializer
    permission_classes = [HasModule('orders')]
    filterset_fields = ['order']
    search_fields = ['product_card__name', 'product_card__sku', 'product_card__category__name', 'product_card__supplier__name']

    def get_queryset(self):
        return super().get_queryset()

    @transaction.atomic
    def perform_create(self, serializer):
        order = serializer.validated_data.get('order')
        _ensure_order_active(order)
        item = serializer.save()
        WarehouseService.assert_stock_available(item)
        ClientService.process_order_client(Order.objects.get(pk=item.order_id))

    @transaction.atomic
    def perform_update(self, serializer):
        item = self.get_object()
        _ensure_order_active(item.order)
        order = serializer.validated_data.get('order')
        if order is not None:
            _ensure_order_active(order)
        new_item = serializer.save()
        WarehouseService.assert_stock_available(new_item)

    @transaction.atomic
    def perform_destroy(self, instance):
        _ensure_order_active(instance.order)
        instance.delete()

class OrderPaymentViewSet(viewsets.ModelViewSet):
    queryset = OrderPayment.objects.select_related('order', 'payment_type').order_by('id')
    serializer_class = OrderPaymentSerializer
    permission_classes = [HasModule('orders')]
    filterset_fields = ['order']

    def get_queryset(self):
        return super().get_queryset()

    @transaction.atomic
    def perform_create(self, serializer):
        order = serializer.validated_data.get('order')
        locked_order = Order.objects.select_for_update().get(pk=order.pk)
        amount = serializer.validated_data.get('amount')
        _recheck_payment_against_locked_order(locked_order, amount)
        serializer.save(order=locked_order)

    @transaction.atomic
    def perform_update(self, serializer):
        payment = serializer.instance
        order = serializer.validated_data.get('order', payment.order)
        locked_order = Order.objects.select_for_update().get(pk=order.pk)
        amount = serializer.validated_data.get('amount', payment.amount)
        _recheck_payment_against_locked_order(
            locked_order, amount, exclude_payment_pk=payment.pk
        )
        serializer.save(order=locked_order)

    @transaction.atomic
    def perform_destroy(self, instance):
        locked_order = Order.objects.select_for_update().get(pk=instance.order_id)
        if is_terminal_status(locked_order.status):
            raise ValidationError(
                "Нельзя удалять платежи завершённого или отменённого заказа."
            )
        instance.delete()


def _sync_order_delivery_fields(order):
    first = order.deliveries.select_related('delivery_service').order_by('id').first()
    order.delivery_service_id = first.delivery_service_id if first else None
    order.tracking_number = first.tracking_number if first else ''
    order.save(update_fields=['delivery_service', 'tracking_number'])


class OrderDeliveryViewSet(viewsets.ModelViewSet):
    queryset = OrderDelivery.objects.select_related('order', 'delivery_service').order_by('id')
    serializer_class = OrderDeliverySerializer
    permission_classes = [HasModule('orders')]
    filterset_fields = ['order']

    @transaction.atomic
    def perform_create(self, serializer):
        order = serializer.validated_data.get('order')
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if is_terminal_status(locked.status):
            raise ValidationError('Нельзя изменять доставку завершённого или отменённого заказа.')
        delivery = serializer.save(order=locked)
        _sync_order_delivery_fields(locked)
        return delivery

    @transaction.atomic
    def perform_update(self, serializer):
        locked = Order.objects.select_for_update().get(pk=serializer.instance.order_id)
        if is_terminal_status(locked.status):
            raise ValidationError('Нельзя изменять доставку завершённого или отменённого заказа.')
        serializer.save()
        _sync_order_delivery_fields(locked)

    @transaction.atomic
    def perform_destroy(self, instance):
        locked = Order.objects.select_for_update().get(pk=instance.order_id)
        if is_terminal_status(locked.status):
            raise ValidationError('Нельзя изменять доставку завершённого или отменённого заказа.')
        instance.delete()
        _sync_order_delivery_fields(locked)


class SalesChannelViewSet(RestrictedDeleteMixin, viewsets.ModelViewSet):
    queryset = SalesChannel.objects.order_by('id')
    serializer_class = SalesChannelSerializer
    permission_classes = [HasModuleOrReadOnly('references')]

class PaymentTypeViewSet(RestrictedDeleteMixin, viewsets.ModelViewSet):
    queryset = PaymentType.objects.order_by('id')
    serializer_class = PaymentTypeSerializer
    permission_classes = [HasModuleOrReadOnly('references')]

class DeliveryServiceViewSet(RestrictedDeleteMixin, viewsets.ModelViewSet):
    queryset = DeliveryService.objects.order_by('id')
    serializer_class = DeliveryServiceSerializer
    permission_classes = [HasAnyModule('orders', 'references')]

    def create(self, request, *args, **kwargs):
        name = (request.data.get('name') or '').strip()
        if name:
            existing = DeliveryService.objects.filter(name=name).first()
            if existing:
                return Response(self.get_serializer(existing).data)
        return super().create(request, *args, **kwargs)


class OrderStatusViewSet(viewsets.ModelViewSet):
    queryset = OrderStatus.objects.order_by('sort_order', 'id')
    serializer_class = OrderStatusSerializer
    permission_classes = [HasModuleOrReadOnly('references')]

    def perform_destroy(self, instance):
        if instance.is_system:
            raise ValidationError('Системный статус нельзя удалить.')
        if Order.objects.filter(status=instance.code).exists():
            raise ValidationError('Нельзя удалить: есть заказы с этим статусом.')
        instance.delete()
