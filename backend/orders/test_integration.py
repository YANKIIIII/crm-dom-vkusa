"""End-to-end integration test of the full order lifecycle through the REST API.

Covers: order creation by a seller (with server-side forcing of seller/created_by),
stock check on item creation without deduct until completed, grill requires a client,
payments, shared order visibility, the status state machine up to completion
(completed_at + client budget update), manager analytics, audit logging, and the
cancellation branch that does not change stock before sale.
"""
import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from orders.models import Order, SalesChannel, PaymentType
from catalog.models import ProductCard, ProductCategory, Supplier
from clients.models import Client
from warehouse.models import StockItem
from users.models import User

ORDERS_URL = '/api/v1/orders/orders/'
ORDER_ITEMS_URL = '/api/v1/orders/order_items/'
ORDER_PAYMENTS_URL = '/api/v1/orders/order_payments/'
ANALYTICS_URL = '/api/v1/analytics/sales/'
AUDIT_LOGS_URL = '/api/v1/common/audit_logs/'


def _client_for(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.mark.django_db
def test_full_order_lifecycle():
    # ---------- 1. Setup ----------
    manager = User.objects.create_user(
        username='int_manager', email='int_manager@test.com', password='pwd',
        role='manager', first_name='Manager',
    )
    seller1 = User.objects.create_user(
        username='int_seller1', email='int_s1@test.com', password='pwd',
        role='seller', first_name='Seller One',
    )
    seller2 = User.objects.create_user(
        username='int_seller2', email='int_s2@test.com', password='pwd',
        role='seller', first_name='Seller Two',
    )
    category = ProductCategory.objects.create(name='Grills', code='A')
    supplier = Supplier.objects.create(name='Integration Supplier')
    product = ProductCard.objects.create(
        name='Integration Grill', sku='INT-G-01', category=category,
        supplier=supplier, base_cost_price=100,
    )
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name='Integration Channel')
    payment_type = PaymentType.objects.create(name='Integration Card')
    grill_client = Client.objects.create(first_name='Иван', last_name='Гриль', seller=seller1)

    api1 = _client_for(seller1)
    api2 = _client_for(seller2)
    api_manager = _client_for(manager)

    # ---------- 2. Seller1 creates an order via the API ----------
    # seller/created_by must be forced server-side: even if the payload tries
    # to point at seller2, the order must belong to seller1.
    response = api1.post(ORDERS_URL, {
        'order_number': 7001,
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
        'seller': seller2.pk,  # must be ignored / overridden
        'client': grill_client.pk,
    })
    assert response.status_code == 201, response.data
    order_id = response.data['id']
    assert response.data['seller'] == seller1.pk
    assert response.data['created_by'] == seller1.pk
    assert response.data['status'] == Order.Status.RESERVED

    # ---------- 3. Seller1 adds a grill item: stock unchanged until completed ----------
    response = api1.post(ORDER_ITEMS_URL, {
        'order': order_id,
        'product_card': product.pk,
        'quantity': 2,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data

    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    order = Order.objects.get(pk=order_id)
    assert order.client_id == grill_client.pk
    assert grill_client.total_budget == Decimal('0.00')

    # ---------- 4. Seller1 registers a payment ----------
    response = api1.post(ORDER_PAYMENTS_URL, {
        'order': order_id,
        'payment_type': payment_type.pk,
        'amount': '180.00',
    })
    assert response.status_code == 201, response.data

    # ---------- 5. Seller2 can see and open seller1's order ----------
    response = api2.get(ORDERS_URL)
    assert response.status_code == 200
    assert order_id in [row['id'] for row in response.data['results']]

    response = api2.get(f'{ORDERS_URL}{order_id}/')
    assert response.status_code == 200

    # ---------- 6. Walk the status state machine to completion ----------
    for new_status in ('confirmed', 'in_delivery', 'completed'):
        response = api1.patch(f'{ORDERS_URL}{order_id}/', {'status': new_status})
        assert response.status_code == 200, (new_status, response.data)
        order.refresh_from_db()
        assert order.status == new_status

    # Terminal status is immutable
    response = api1.patch(f'{ORDERS_URL}{order_id}/', {'status': 'reserved'})
    assert response.status_code == 400
    order.refresh_from_db()
    assert order.status == Order.Status.COMPLETED

    # ---------- 7. Completion side effects ----------
    assert order.completed_at is not None

    grill_client.refresh_from_db()
    # total_budget = price * (1 + vat/100) * qty * (1 - discount/100)
    #              = 150 * 1.20 * 2 * 1.00 = 360.00
    assert grill_client.total_budget == Decimal('360.00')
    stock.refresh_from_db()
    assert stock.stock_quantity == 8

    # ---------- 8. Manager checks analytics ----------
    response = api_manager.get(ANALYTICS_URL)
    assert response.status_code == 200, response.data
    assert Decimal(str(response.data['total_revenue'])) == Decimal('360.00')
    assert response.data['total_completed_orders'] == 1

    # ---------- 9. Manager checks audit logs ----------
    response = api_manager.get(AUDIT_LOGS_URL)
    assert response.status_code == 200, response.data
    order_logs = [
        row for row in response.data['results']
        if row['entity_type'] == 'order' and row['entity_id'] == order_id
    ]
    create_logs = [row for row in order_logs if row['action'] == 'CREATE']
    assert len(create_logs) == 1

    update_transitions = {
        (row['details']['old_status'], row['details']['new_status'])
        for row in order_logs if row['action'] == 'UPDATE'
    }
    assert update_transitions == {
        ('reserved', 'confirmed'),
        ('confirmed', 'in_delivery'),
        ('in_delivery', 'completed'),
    }

    # ---------- 10. Cancellation before sale does not change stock ----------
    response = api1.post(ORDERS_URL, {
        'order_number': 7002,
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
        'seller': seller1.pk,
        'client': grill_client.pk,
    })
    assert response.status_code == 201, response.data
    order2_id = response.data['id']

    response = api1.post(ORDER_ITEMS_URL, {
        'order': order2_id,
        'product_card': product.pk,
        'quantity': 3,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 8

    response = api1.patch(f'{ORDERS_URL}{order2_id}/', {'status': 'cancelled'})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 8

    # Cancelled order must not leak into completed-order analytics
    response = api_manager.get(ANALYTICS_URL)
    assert response.status_code == 200
    assert response.data['total_completed_orders'] == 1
