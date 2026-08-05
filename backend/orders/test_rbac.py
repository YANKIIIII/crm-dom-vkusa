import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from orders.models import Order, SalesChannel
from catalog.models import ProductCard, ProductCategory, Supplier
from warehouse.models import StockItem
from users.models import User

ORDER_ITEMS_URL = '/api/v1/orders/order_items/'


def _make_order(user, channel, number):
    return Order.objects.create(
        order_number=number,
        order_date=timezone.now().date(),
        status=Order.Status.RESERVED,
        seller=user,
        sales_channel=channel,
        created_by=user,
    )


@pytest.mark.django_db
def test_seller_cannot_repoint_order_item_to_other_sellers_order():
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    category = ProductCategory.objects.create(name='Grills', code='A')
    supplier = Supplier.objects.create(name='Supplier X')
    product = ProductCard.objects.create(
        name='Test Grill', sku='G-01', category=category, supplier=supplier, base_cost_price=100
    )
    # Enough stock so that API creation (which reserves stock) succeeds
    StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name='Website')
    own_order = _make_order(seller1, channel, number=1)
    foreign_order = _make_order(seller2, channel, number=2)

    api = APIClient()
    api.force_authenticate(user=seller1)

    response = api.post(ORDER_ITEMS_URL, {
        'order': own_order.pk,
        'product_card': product.pk,
        'quantity': 2,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    item_id = response.data['id']

    # Re-pointing the item into another seller's order must be forbidden
    response = api.patch(f'{ORDER_ITEMS_URL}{item_id}/', {'order': foreign_order.pk})
    assert response.status_code == 403

    own_order.refresh_from_db()
    assert own_order.items.count() == 1
    assert foreign_order.items.count() == 0
