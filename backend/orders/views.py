from django.db import transaction
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from common.permissions import IsManagerOrReadOnly
from clients.services import ClientService
from warehouse.services import WarehouseService
from .models import Order, OrderItem, OrderPayment, SalesChannel, PaymentType, DeliveryService
from .serializers import OrderSerializer, OrderItemSerializer, OrderPaymentSerializer, SalesChannelSerializer, PaymentTypeSerializer, DeliveryServiceSerializer

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related(
        'seller', 'sales_channel', 'client', 'delivery_service'
    ).prefetch_related(
        'items__product_card__category', 'items__product_card__supplier', 'payments__payment_type'
    ).order_by('-id')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'seller', 'sales_channel', 'client']
    search_fields = [
        'order_number', 'tracking_number', 'client__first_name', 'client__last_name', 'client__email', 'client__phones__number',
        'items__product_card__name', 'items__product_card__sku', 'items__product_card__category__name', 'items__product_card__supplier__name',
    ]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if hasattr(user, 'role') and user.role == 'seller':
            qs = qs.filter(seller=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            serializer.save(seller=user, created_by=user)
        else:
            serializer.save(created_by=user)

    @transaction.atomic
    def perform_update(self, serializer):
        # Lock row so concurrent status transitions serialize and signal side-effects don't double-fire.
        Order.objects.select_for_update().filter(pk=serializer.instance.pk).first()
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            # Нельзя менять продавца и создателя
            serializer.save(seller=user)
        else:
            serializer.save()

    def destroy(self, request, *args, **kwargs):
        if hasattr(request.user, 'role') and request.user.role == 'seller':
            raise PermissionDenied("Продавцы не могут удалять заказы.")
        return super().destroy(request, *args, **kwargs)

    @transaction.atomic
    def perform_destroy(self, instance):
        # Отменённый заказ уже вернул товар на склад, завершённый — товар продан;
        # возвращаем резерв только для активных заказов.
        if instance.status not in (Order.Status.CANCELLED, Order.Status.COMPLETED):
            WarehouseService.release_items(instance)
        instance.delete()

def _ensure_order_active(order):
    """Состав терминального заказа неизменяем: отмена уже вернула товар на
    склад, завершение означает продажу — любые мутации позиций разойдутся
    с остатками."""
    if order.status in (Order.Status.COMPLETED, Order.Status.CANCELLED):
        raise ValidationError(
            "Нельзя изменять состав завершённого или отменённого заказа."
        )


class OrderItemViewSet(viewsets.ModelViewSet):
    queryset = OrderItem.objects.select_related('order', 'product_card').order_by('id')
    serializer_class = OrderItemSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['order']
    search_fields = ['product_card__name', 'product_card__sku', 'product_card__category__name', 'product_card__supplier__name']

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if hasattr(user, 'role') and user.role == 'seller':
            qs = qs.filter(order__seller=user)
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        order = serializer.validated_data.get('order')
        if hasattr(self.request.user, 'role') and self.request.user.role == 'seller':
            if order.seller != self.request.user:
                raise PermissionDenied("Нельзя добавлять товары в чужой заказ.")
        _ensure_order_active(order)
        item = serializer.save()
        WarehouseService.reserve_stock_for_item(item)
        ClientService.process_order_client(item.order)

    @transaction.atomic
    def perform_update(self, serializer):
        order = serializer.validated_data.get('order')
        if hasattr(self.request.user, 'role') and self.request.user.role == 'seller':
            if order is not None and order.seller != self.request.user:
                raise PermissionDenied("Нельзя переносить товары в чужой заказ.")
        item = self.get_object()
        _ensure_order_active(item.order)
        if order is not None:
            _ensure_order_active(order)
        old_quantity = item.quantity
        old_product_card = item.product_card
        new_item = serializer.save()
        WarehouseService.update_stock_for_item_update(
            new_item, old_product_card, old_quantity
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        _ensure_order_active(instance.order)
        WarehouseService.release_stock_for_item(instance)
        instance.delete()

class OrderPaymentViewSet(viewsets.ModelViewSet):
    queryset = OrderPayment.objects.select_related('order', 'payment_type').order_by('id')
    serializer_class = OrderPaymentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['order']

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if hasattr(user, 'role') and user.role == 'seller':
            qs = qs.filter(order__seller=user)
        return qs

    def perform_create(self, serializer):
        order = serializer.validated_data.get('order')
        if hasattr(self.request.user, 'role') and self.request.user.role == 'seller':
            if order.seller != self.request.user:
                raise PermissionDenied("Нельзя добавлять платежи в чужой заказ.")
        serializer.save()

    def perform_update(self, serializer):
        order = serializer.validated_data.get('order')
        if hasattr(self.request.user, 'role') and self.request.user.role == 'seller':
            if order is not None and order.seller != self.request.user:
                raise PermissionDenied("Нельзя переносить платежи в чужой заказ.")
        serializer.save()

class SalesChannelViewSet(viewsets.ModelViewSet):
    queryset = SalesChannel.objects.order_by('id')
    serializer_class = SalesChannelSerializer
    permission_classes = [IsManagerOrReadOnly]

class PaymentTypeViewSet(viewsets.ModelViewSet):
    queryset = PaymentType.objects.order_by('id')
    serializer_class = PaymentTypeSerializer
    permission_classes = [IsManagerOrReadOnly]

class DeliveryServiceViewSet(viewsets.ModelViewSet):
    queryset = DeliveryService.objects.order_by('id')
    serializer_class = DeliveryServiceSerializer
    permission_classes = [IsManagerOrReadOnly]

