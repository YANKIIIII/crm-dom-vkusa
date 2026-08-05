from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal
from users.models import User
from clients.models import Client
from catalog.models import ProductCard

class SalesChannel(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='Наименование')
    class Meta:
        db_table = 'sales_channels'

class PaymentType(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='Наименование')
    class Meta:
        db_table = 'payment_types'

class DeliveryService(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='Наименование')
    class Meta:
        db_table = 'delivery_services'

class Order(models.Model):
    class Status(models.TextChoices):
        RESERVED = 'reserved', 'Резерв'
        CONFIRMED = 'confirmed', 'Подтвержден'
        IN_DELIVERY = 'in_delivery', 'В доставке'
        COMPLETED = 'completed', 'Завершен'
        CANCELLED = 'cancelled', 'Отменен'

    order_number = models.PositiveIntegerField(unique=True, verbose_name='Номер заказа')
    order_date = models.DateField(verbose_name='Дата заказа')
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.RESERVED, verbose_name='Статус'
    )
    seller = models.ForeignKey(
        User, on_delete=models.RESTRICT, related_name='orders_as_seller', verbose_name='Продавец'
    )
    sales_channel = models.ForeignKey(
        SalesChannel, on_delete=models.RESTRICT, verbose_name='Канал продаж'
    )
    client = models.ForeignKey(
        Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders', verbose_name='Клиент'
    )
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, 
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name='Скидка (%)'
    )
    delivery_service = models.ForeignKey(
        DeliveryService, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Служба доставки'
    )
    tracking_number = models.CharField(max_length=100, blank=True, verbose_name='Трек-номер')
    comment = models.TextField(null=True, blank=True, verbose_name='Комментарий')
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата завершения')
    created_by = models.ForeignKey(
        User, on_delete=models.RESTRICT, related_name='orders_created', verbose_name='Создатель'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def subtotal(self):
        return sum(item.price_with_vat * item.quantity for item in self.items.all())

    @property
    def total_cost(self):
        return sum(item.cost_price * item.quantity for item in self.items.all())

    @property
    def total_amount(self):
        return self.subtotal * (Decimal('1') - self.discount_percent / Decimal('100'))

    @property
    def gross_profit(self):
        return self.total_amount - self.total_cost

    def save(self, *args, **kwargs):
        if self.client and not self.pk:
            self.discount_percent = self.client.discount_percent
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'orders'
        indexes = [
            models.Index(fields=['order_date'], name='idx_orders_date'),
            models.Index(fields=['seller'], name='idx_orders_seller'),
            models.Index(fields=['client'], name='idx_orders_client'),
            models.Index(fields=['status'], name='idx_orders_status'),
        ]

# Допустимые переходы статусов заказа: терминальные статусы (completed, cancelled)
# не допускают изменений, повторное сохранение того же статуса разрешено всегда.
ALLOWED_STATUS_TRANSITIONS = {
    Order.Status.RESERVED: (Order.Status.CONFIRMED, Order.Status.CANCELLED),
    Order.Status.CONFIRMED: (Order.Status.IN_DELIVERY, Order.Status.COMPLETED, Order.Status.CANCELLED),
    Order.Status.IN_DELIVERY: (Order.Status.COMPLETED, Order.Status.CANCELLED),
    Order.Status.COMPLETED: (),
    Order.Status.CANCELLED: (),
}

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items', verbose_name='Заказ')
    product_card = models.ForeignKey(
        ProductCard, on_delete=models.RESTRICT, related_name='order_items', verbose_name='Товар'
    )
    quantity = models.PositiveIntegerField(verbose_name='Количество')
    cost_price = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))], verbose_name='Себестоимость'
    )
    price = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))], verbose_name='Цена без НДС'
    )
    vat_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=20, validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))], verbose_name='Ставка НДС (%)'
    )

    @property
    def price_with_vat(self):
        return self.price * (Decimal('1') + self.vat_rate / Decimal('100'))

    @property
    def line_total(self):
        return self.price_with_vat * self.quantity

    class Meta:
        db_table = 'order_items'

class OrderPayment(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments', verbose_name='Заказ')
    payment_type = models.ForeignKey(PaymentType, on_delete=models.RESTRICT, verbose_name='Способ оплаты')
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))], verbose_name='Сумма'
    )

    class Meta:
        db_table = 'order_payments'

