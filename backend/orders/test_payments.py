import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from orders.models import Order, OrderItem, OrderPayment, SalesChannel, PaymentType
from catalog.models import ProductCard, ProductCategory, Supplier
from warehouse.models import StockItem
from users.models import User

ORDER_ITEMS_URL = '/api/v1/orders/order_items/'
ORDER_PAYMENTS_URL = '/api/v1/orders/order_payments/'


def _make_order(user, channel, number, status=Order.Status.RESERVED):
    return Order.objects.create(
        order_number=number,
        order_date=timezone.now().date(),
        status=status,
        seller=user,
        sales_channel=channel,
        created_by=user,
    )


def _add_item(order, product, quantity=1):
    return OrderItem.objects.create(
        order=order,
        product_card=product,
        quantity=quantity,
        cost_price=Decimal('100.00'),
        price=Decimal('150.00'),
        vat_rate=Decimal('20.00'),
    )


@pytest.fixture
def payment_env(db):
    manager = User.objects.create_user(
        username='pay_manager', email='pay_mgr@test.com', password='pwd',
        role='manager', first_name='PayManager',
    )
    category = ProductCategory.objects.create(name='Grills', code='A')
    supplier = Supplier.objects.create(name='Pay Supplier')
    product = ProductCard.objects.create(
        name='Pay Grill', sku='PAY-G-01', category=category,
        supplier=supplier, base_cost_price=100,
    )
    StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name='Pay Channel')
    payment_type = PaymentType.objects.create(name='Pay Card')
    api = APIClient()
    api.force_authenticate(user=manager)
    return api, manager, channel, payment_type, product


@pytest.mark.django_db
def test_filter_payments_by_order(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order1 = _make_order(manager, channel, 8001)
    order2 = _make_order(manager, channel, 8002)
    _add_item(order1, product)
    _add_item(order2, product)

    pay1 = OrderPayment.objects.create(
        order=order1, payment_type=payment_type, amount=Decimal('50.00'),
    )
    pay2 = OrderPayment.objects.create(
        order=order2, payment_type=payment_type, amount=Decimal('60.00'),
    )

    response = api.get(ORDER_PAYMENTS_URL, {'order': order1.pk})

    assert response.status_code == 200, response.data
    ids = [row['id'] for row in response.data['results']]
    assert ids == [pay1.pk]
    assert pay2.pk not in ids


@pytest.mark.django_db
def test_overpay_returns_400(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8003)
    _add_item(order, product)
    # total_amount = 150 * 1.2 * 1 = 180.00
    order_total = order.total_amount
    assert order_total == Decimal('180.00')

    response = api.post(ORDER_PAYMENTS_URL, {
        'order': order.pk,
        'payment_type': payment_type.pk,
        'amount': str(order_total + Decimal('0.02')),
    })

    assert response.status_code == 400


@pytest.mark.django_db
def test_payment_on_cancelled_order_returns_400(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8004, status=Order.Status.CANCELLED)
    _add_item(order, product)

    response = api.post(ORDER_PAYMENTS_URL, {
        'order': order.pk,
        'payment_type': payment_type.pk,
        'amount': '50.00',
    })

    assert response.status_code == 400


@pytest.mark.django_db
def test_valid_payment_returns_201(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8005)
    _add_item(order, product)

    response = api.post(ORDER_PAYMENTS_URL, {
        'order': order.pk,
        'payment_type': payment_type.pk,
        'amount': '90.00',
    })

    assert response.status_code == 201, response.data
    assert OrderPayment.objects.filter(order=order).count() == 1


@pytest.mark.django_db
def test_payment_update_overpay_returns_400(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8006)
    _add_item(order, product)
    payment = OrderPayment.objects.create(
        order=order, payment_type=payment_type, amount=Decimal('90.00'),
    )

    response = api.patch(f'{ORDER_PAYMENTS_URL}{payment.pk}/', {
        'amount': '180.02',
    })

    assert response.status_code == 400
    payment.refresh_from_db()
    assert payment.amount == Decimal('90.00')


@pytest.mark.django_db
def test_payment_create_rechecks_overpay_under_lock(payment_env, monkeypatch):
    """perform_create re-sums payments against a locked order after serializer validate."""
    from orders.views import OrderPaymentViewSet

    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8007)
    _add_item(order, product)
    # total_amount = 180.00; leave room for a 100 payment at serializer time
    OrderPayment.objects.create(
        order=order, payment_type=payment_type, amount=Decimal('80.00'),
    )

    original_create = OrderPaymentViewSet.perform_create

    def race_extra_payment_then_create(self, serializer):
        # Concurrent payment fills the remaining balance before our save.
        OrderPayment.objects.create(
            order=order, payment_type=payment_type, amount=Decimal('100.00'),
        )
        return original_create(self, serializer)

    monkeypatch.setattr(
        OrderPaymentViewSet, 'perform_create', race_extra_payment_then_create
    )

    response = api.post(ORDER_PAYMENTS_URL, {
        'order': order.pk,
        'payment_type': payment_type.pk,
        'amount': '100.00',
    })

    assert response.status_code == 400
    # Only the two payments we inserted directly (80 + 100), not the POST.
    assert OrderPayment.objects.filter(order=order).count() == 2


@pytest.mark.django_db
def test_cannot_delete_payment_on_completed_order(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8008, status=Order.Status.RESERVED)
    _add_item(order, product)
    payment = OrderPayment.objects.create(
        order=order, payment_type=payment_type, amount=Decimal('50.00'),
    )
    Order.objects.filter(pk=order.pk).update(status=Order.Status.COMPLETED)

    response = api.delete(f'{ORDER_PAYMENTS_URL}{payment.pk}/')

    assert response.status_code == 400
    assert OrderPayment.objects.filter(pk=payment.pk).exists()


@pytest.mark.django_db
def test_cannot_delete_payment_on_cancelled_order(payment_env):
    api, manager, channel, payment_type, product = payment_env
    order = _make_order(manager, channel, 8009, status=Order.Status.RESERVED)
    _add_item(order, product)
    payment = OrderPayment.objects.create(
        order=order, payment_type=payment_type, amount=Decimal('50.00'),
    )
    Order.objects.filter(pk=order.pk).update(status=Order.Status.CANCELLED)

    response = api.delete(f'{ORDER_PAYMENTS_URL}{payment.pk}/')

    assert response.status_code == 400
    assert OrderPayment.objects.filter(pk=payment.pk).exists()
