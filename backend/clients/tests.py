import pytest
from datetime import date
from django.utils import timezone
from clients.models import Client
from catalog.models import ProductCard, ProductCategory, Supplier
from orders.models import Order, OrderItem, OrderStatus, SalesChannel
from users.models import User
from clients.services import ClientService
from decimal import Decimal

@pytest.mark.django_db
def test_update_budget_on_completion():
    user = User.objects.create_user(username='testuser', email='test@test.com', password='pwd', role='manager', first_name='Test')
    client = Client.objects.create(first_name='Test Client', total_budget=0)
    channel = SalesChannel.objects.create(name="Website")
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category, supplier=supplier, base_cost_price=100)
    
    order = Order.objects.create(
        order_number=1,
        order_date=timezone.now().date(),
        status=Order.Status.RESERVED,
        seller=user,
        sales_channel=channel,
        created_by=user,
        client=client
    )

    OrderItem.objects.create(
        order=order, product_card=product, quantity=2, cost_price=100, price=200, vat_rate=20
    ) # 2 * 200 * 1.2 = 480

    # Act
    order.status = Order.Status.COMPLETED
    order.save()

    # Assert
    client.refresh_from_db()
    assert float(client.total_budget) == 480.0
    assert client.last_purchase_date == date.today()


@pytest.mark.django_db
def test_repurchase_updates_category_and_grill_not_fio():
    user = User.objects.create_user(username='rep', email='rep@test.com', password='pwd', role='manager')
    client = Client.objects.create(
        first_name='Иван', last_name='Петров', purchase_category='B',
        first_purchase_date=date(2024, 1, 1),
    )
    channel = SalesChannel.objects.create(name='Сайт')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-R1', category=category, supplier=supplier,
        base_cost_price=100, grill_type='gas',
    )
    order = Order.objects.create(
        order_number=40, order_date=timezone.now().date(),
        status=Order.Status.RESERVED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1, cost_price=100, price=200, vat_rate=20,
    )
    ClientService.sync_profile_from_order(order)
    client.refresh_from_db()
    assert client.first_name == 'Иван'
    assert client.last_name == 'Петров'
    assert client.first_purchase_date == date(2024, 1, 1)
    assert client.purchase_category == 'A'
    assert client.grill_type == 'gas'
    assert client.last_purchase_date == order.order_date


@pytest.mark.django_db
def test_budget_recalculate_does_not_double_count():
    user = User.objects.create_user(username='bud', email='bud@test.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='Клиент')
    channel = SalesChannel.objects.create(name='Сайт')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-B1', category=category, supplier=supplier, base_cost_price=50,
    )
    order = Order.objects.create(
        order_number=41, order_date=timezone.now().date(),
        status=Order.Status.COMPLETED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1, cost_price=50, price=100, vat_rate=0,
    )
    ClientService.recalculate_budget(client)
    ClientService.recalculate_budget(client)
    client.refresh_from_db()
    assert client.total_budget == Decimal('100.00')


@pytest.mark.django_db
def test_client_list_filters_grill_channel_and_last_purchase():
    from rest_framework.test import APIClient

    manager = User.objects.create_user(username='cl_f', email='clf@test.com', password='pwd', role='manager')
    gas = Client.objects.create(
        first_name='Gas', seller=manager, grill_type='gas',
        acquisition_source='Instagram', last_purchase_date=date(2026, 8, 12),
    )
    charcoal = Client.objects.create(
        first_name='Coal', seller=manager, grill_type='charcoal',
        acquisition_source='Сайт', last_purchase_date=date(2026, 1, 10),
    )

    api = APIClient()
    api.force_authenticate(user=manager)

    by_grill = api.get('/api/v1/clients/clients/', {'grill_type': 'gas'})
    assert by_grill.status_code == 200
    grill_ids = [row['id'] for row in by_grill.data['results']]
    assert gas.pk in grill_ids
    assert charcoal.pk not in grill_ids

    by_channel = api.get('/api/v1/clients/clients/', {'acquisition_source': 'Instagram'})
    assert by_channel.status_code == 200
    channel_ids = [row['id'] for row in by_channel.data['results']]
    assert gas.pk in channel_ids
    assert charcoal.pk not in channel_ids

    by_date = api.get('/api/v1/clients/clients/', {
        'last_purchase_after': '2026-08-01',
        'last_purchase_before': '2026-08-31',
    })
    assert by_date.status_code == 200
    date_ids = [row['id'] for row in by_date.data['results']]
    assert gas.pk in date_ids
    assert charcoal.pk not in date_ids


@pytest.mark.django_db
def test_adding_item_to_reserved_order_does_not_set_purchase_dates():
    from rest_framework.test import APIClient
    from warehouse.models import StockItem

    user = User.objects.create_user(username='dates', email='dates@test.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='Draft')
    channel = SalesChannel.objects.create(name='Сайт')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-D1', category=category, supplier=supplier, base_cost_price=100,
    )
    StockItem.objects.create(product_card=product, stock_quantity=10)
    order = Order.objects.create(
        order_number=50, order_date=timezone.now().date(),
        status=Order.Status.RESERVED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    api = APIClient()
    api.force_authenticate(user=user)
    response = api.post('/api/v1/orders/order_items/', {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 1,
        'cost_price': 100,
        'price': 200,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    client.refresh_from_db()
    assert client.last_purchase_date is None
    assert client.first_purchase_date is None

    completed = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'completed'})
    assert completed.status_code == 200, completed.data
    client.refresh_from_db()
    assert client.last_purchase_date == order.order_date
    assert client.first_purchase_date == order.order_date


@pytest.mark.django_db
def test_cancel_clears_purchase_dates_when_no_completed_orders_remain():
    user = User.objects.create_user(username='cancel_d', email='cd@test.com', password='pwd', role='manager')
    client = Client.objects.create(
        first_name='Once', first_purchase_date=date(2026, 1, 1), last_purchase_date=date(2026, 1, 1),
    )
    channel = SalesChannel.objects.create(name='Сайт')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-C1', category=category, supplier=supplier, base_cost_price=100,
    )
    order = Order.objects.create(
        order_number=51, order_date=date(2026, 1, 1),
        status=Order.Status.COMPLETED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1, cost_price=100, price=200, vat_rate=0,
    )
    order.status = Order.Status.CANCELLED
    order.save()
    client.refresh_from_db()
    assert client.first_purchase_date is None
    assert client.last_purchase_date is None
    assert client.total_budget == Decimal('0.00')


@pytest.mark.django_db
def test_purchase_category_comes_from_grill_not_first_line():
    user = User.objects.create_user(username='cat_g', email='cg@test.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='Mix')
    channel = SalesChannel.objects.create(name='Сайт')
    acc = ProductCategory.objects.create(name='Аксессуары', code='B')
    grill_cat = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    accessory = ProductCard.objects.create(
        name='Cover', sku='CV-1', category=acc, supplier=supplier, base_cost_price=10,
    )
    grill = ProductCard.objects.create(
        name='Grill', sku='G-M1', category=grill_cat, supplier=supplier,
        base_cost_price=100, grill_type='gas',
    )
    order = Order.objects.create(
        order_number=52, order_date=timezone.now().date(),
        status=Order.Status.RESERVED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=accessory, quantity=1, cost_price=10, price=20, vat_rate=0,
    )
    OrderItem.objects.create(
        order=order, product_card=grill, quantity=1, cost_price=100, price=200, vat_rate=0,
    )
    order.status = Order.Status.COMPLETED
    order.save()
    client.refresh_from_db()
    assert client.purchase_category == 'A'
    assert client.grill_type == 'gas'


@pytest.mark.django_db
def test_custom_completed_status_updates_budget_and_dates():
    user = User.objects.create_user(
        username='sold_custom', email='sc@test.com', password='pwd', role='manager',
    )
    client = Client.objects.create(first_name='Салон')
    channel = SalesChannel.objects.create(name='Салон')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-C1', category=category, supplier=supplier, base_cost_price=100,
    )
    OrderStatus.objects.create(
        code='sold_salon', name='Продано в салоне',
        kind=OrderStatus.Kind.COMPLETED, sort_order=45,
    )
    order = Order.objects.create(
        order_number=60, order_date=timezone.now().date(),
        status=Order.Status.RESERVED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=2, cost_price=100, price=200, vat_rate=20,
    )
    order.status = 'sold_salon'
    order.save()
    client.refresh_from_db()
    assert float(client.total_budget) == 480.0
    assert client.last_purchase_date == date.today()
