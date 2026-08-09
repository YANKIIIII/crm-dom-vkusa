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
def test_order_item_creation_reduces_stock():
    user = User.objects.create_user(username='testuser', email='test@test.com', password='pwd', role='manager', first_name='Test')
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category, supplier=supplier, base_cost_price=100)
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name="Website")
    order = _make_order(user, channel, number=1)

    api = APIClient()
    api.force_authenticate(user=user)

    # Creating the item through the API should trigger stock reservation
    response = api.post(ORDER_ITEMS_URL, {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 3,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })

    assert response.status_code == 201, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 7

    # Requesting more than available must fail and leave no orphan item
    response = api.post(ORDER_ITEMS_URL, {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 100,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })

    assert response.status_code == 400
    stock.refresh_from_db()
    assert stock.stock_quantity == 7
    assert order.items.count() == 1


@pytest.mark.django_db
def test_auto_create_client_on_grill_purchase():
    user = User.objects.create_user(username='testuser2', email='test2@test.com', password='pwd', role='manager', first_name='Test')
    category_grill = ProductCategory.objects.create(name="Grills", code="A")
    category_other = ProductCategory.objects.create(name="Accessories", code="B")
    supplier = Supplier.objects.create(name="Supplier X")

    product_grill = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category_grill, supplier=supplier, base_cost_price=100)
    product_other = ProductCard.objects.create(name="Test Accessory", sku="A-01", category=category_other, supplier=supplier, base_cost_price=10)
    StockItem.objects.create(product_card=product_grill, stock_quantity=10)
    StockItem.objects.create(product_card=product_other, stock_quantity=10)

    channel = SalesChannel.objects.create(name="Website")

    api = APIClient()
    api.force_authenticate(user=user)

    # 1. Order with no client, buying accessory -> No client created
    order1 = _make_order(user, channel, number=2)
    response = api.post(ORDER_ITEMS_URL, {
        'order': order1.pk,
        'product_card': product_other.pk,
        'quantity': 1,
        'cost_price': 10,
        'price': 20,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    order1.refresh_from_db()
    assert order1.client is None

    # 2. Order with no client, buying grill -> Client should be auto-created
    order2 = _make_order(user, channel, number=3)
    response = api.post(ORDER_ITEMS_URL, {
        'order': order2.pk,
        'product_card': product_grill.pk,
        'quantity': 1,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    order2.refresh_from_db()
    assert order2.client is not None
    assert order2.client.first_name == f"Новый Клиент (Заказ #{order2.order_number})"
    assert order2.client.seller == user
    assert order2.client.purchase_category == 'A'


@pytest.mark.django_db
def test_order_destroy_releases_stock_only_for_active_orders():
    user = User.objects.create_user(username='testuser3', email='test3@test.com', password='pwd', role='manager', first_name='Test')
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category, supplier=supplier, base_cost_price=100)
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name="Website")

    api = APIClient()
    api.force_authenticate(user=user)

    def create_order_with_item(number):
        order = _make_order(user, channel, number=number)
        response = api.post(ORDER_ITEMS_URL, {
            'order': order.pk,
            'product_card': product.pk,
            'quantity': 3,
            'cost_price': 100,
            'price': 150,
            'vat_rate': 20,
        })
        assert response.status_code == 201, response.data
        return order

    # Deleting an active (reserved) order returns its stock
    order = create_order_with_item(number=10)
    stock.refresh_from_db()
    assert stock.stock_quantity == 7

    response = api.delete(f'/api/v1/orders/orders/{order.pk}/')
    assert response.status_code == 204
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    # Deleting a cancelled order must NOT release stock twice
    order = create_order_with_item(number=11)
    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'cancelled'})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 10  # released by cancellation signal

    response = api.delete(f'/api/v1/orders/orders/{order.pk}/')
    assert response.status_code == 204
    stock.refresh_from_db()
    assert stock.stock_quantity == 10  # no double release


@pytest.mark.django_db
def test_cannot_delete_completed_order():
    user = User.objects.create_user(
        username='testuser_completed_del', email='completed_del@test.com',
        password='pwd', role='manager', first_name='Test',
    )
    channel = SalesChannel.objects.create(name="Completed Delete Channel")
    order = Order.objects.create(
        order_number=12,
        order_date=timezone.now().date(),
        status=Order.Status.COMPLETED,
        seller=user,
        sales_channel=channel,
        created_by=user,
    )

    api = APIClient()
    api.force_authenticate(user=user)

    response = api.delete(f'/api/v1/orders/orders/{order.pk}/')

    assert response.status_code == 400
    assert 'Нельзя удалить завершённый заказ' in str(response.data)
    assert Order.objects.filter(pk=order.pk).exists()


@pytest.mark.django_db
def test_terminal_order_items_are_immutable():
    user = User.objects.create_user(username='testuser4', email='test4@test.com', password='pwd', role='manager', first_name='Test')
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category, supplier=supplier, base_cost_price=100)
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name="Website")

    api = APIClient()
    api.force_authenticate(user=user)

    order = _make_order(user, channel, number=20)
    response = api.post(ORDER_ITEMS_URL, {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 3,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    item_id = response.data['id']

    # Cancel the order: stock is released by the signal
    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'cancelled'})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    # Deleting an item of a cancelled order must not double-release stock
    response = api.delete(f'{ORDER_ITEMS_URL}{item_id}/')
    assert response.status_code == 400
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    # Updating an item of a cancelled order is forbidden
    response = api.patch(f'{ORDER_ITEMS_URL}{item_id}/', {'quantity': 5})
    assert response.status_code == 400
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    # Adding an item to a cancelled order is forbidden
    response = api.post(ORDER_ITEMS_URL, {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 1,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 400
    stock.refresh_from_db()
    assert stock.stock_quantity == 10
