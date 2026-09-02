import pytest
from datetime import date
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
    assert stock.stock_quantity == 10

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
    assert stock.stock_quantity == 10
    assert order.items.count() == 1

    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'confirmed'})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'completed'})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 7


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

    # 2. Grill without client → 400 (UI must collect ФИО/телефон first)
    order2 = _make_order(user, channel, number=3)
    response = api.post(ORDER_ITEMS_URL, {
        'order': order2.pk,
        'product_card': product_grill.pk,
        'quantity': 1,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 400, response.data
    order2.refresh_from_db()
    assert order2.client is None
    assert order2.items.count() == 0

    # 3. Grill with a client already on the order must not be rejected
    from clients.models import Client
    existing = Client.objects.create(first_name='Иван', last_name='Петров', seller=user)
    order3 = _make_order(user, channel, number=4)
    order3.client = existing
    order3.save(update_fields=['client'])
    response = api.post(ORDER_ITEMS_URL, {
        'order': order3.pk,
        'product_card': product_grill.pk,
        'quantity': 1,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    order3.refresh_from_db()
    assert order3.client_id == existing.pk
    assert order3.items.count() == 1


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

    # Deleting a reserved order must not change stock (nothing was deducted)
    order = create_order_with_item(number=10)
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    response = api.delete(f'/api/v1/orders/orders/{order.pk}/')
    assert response.status_code == 204
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    order = create_order_with_item(number=11)
    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'cancelled'})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    response = api.delete(f'/api/v1/orders/orders/{order.pk}/')
    assert response.status_code == 204
    stock.refresh_from_db()
    assert stock.stock_quantity == 10


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

    # Cancel: stock was never deducted
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


@pytest.mark.django_db
def test_orders_list_supports_ordering_and_page_size():
    user = User.objects.create_user(
        username='pager', email='pager@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    for number in (10, 20, 30):
        _make_order(user, channel, number=number)

    api = APIClient()
    api.force_authenticate(user=user)

    response = api.get('/api/v1/orders/orders/', {'ordering': 'order_number', 'page_size': 2})
    assert response.status_code == 200
    assert response.data['count'] == 3
    assert len(response.data['results']) == 2
    numbers = [row['order_number'] for row in response.data['results']]
    assert numbers == sorted(numbers)

    response = api.get('/api/v1/orders/orders/', {'status': 'reserved'})
    assert response.status_code == 200
    assert response.data['count'] == 3


@pytest.mark.django_db
def test_orders_list_includes_client_and_orders_by_last_name():
    from clients.models import Client

    user = User.objects.create_user(
        username='ord_cli', email='ordcli@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    andreev = Client.objects.create(first_name='Борис', last_name='Андреев', seller=user)
    yakovleva = Client.objects.create(first_name='Анна', last_name='Яковлева', seller=user)
    order_an = _make_order(user, channel, number=501)
    order_an.client = andreev
    order_an.save(update_fields=['client'])
    order_ya = _make_order(user, channel, number=502)
    order_ya.client = yakovleva
    order_ya.save(update_fields=['client'])

    api = APIClient()
    api.force_authenticate(user=user)
    response = api.get('/api/v1/orders/orders/', {'ordering': 'client__last_name'})
    assert response.status_code == 200, response.data
    names = [row['client_last_name'] for row in response.data['results']]
    assert names == ['Андреев', 'Яковлева']
    assert response.data['results'][0]['client_name'] == 'Борис'


@pytest.mark.django_db
def test_delete_order_writes_audit_log():
    from common.models import AuditLog

    user = User.objects.create_user(
        username='ord_del_aud', email='orddelaud@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    order = _make_order(user, channel, number=701)
    pk = order.pk

    api = APIClient()
    api.force_authenticate(user=user)
    response = api.delete(f'/api/v1/orders/orders/{pk}/')
    assert response.status_code == 204
    log = AuditLog.objects.get(action='DELETE', entity_type='order', entity_id=pk)
    assert log.user_id == user.pk
    assert log.details['order_number'] == 701
    assert log.details['old']['status'] == 'reserved'


@pytest.mark.django_db
def test_complete_order_writes_system_stock_audit():
    from common.models import AuditLog

    user = User.objects.create_user(
        username='ord_sys', email='ordsys@test.com', password='pwd', role='manager',
    )
    category = ProductCategory.objects.create(name='Grills')
    supplier = Supplier.objects.create(name='Supplier X')
    product = ProductCard.objects.create(
        name='Sys Grill', sku='SYS-1', category=category, supplier=supplier, base_cost_price=100,
    )
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name='Website')
    order = _make_order(user, channel, number=702)

    api = APIClient()
    api.force_authenticate(user=user)
    created = api.post(ORDER_ITEMS_URL, {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 2,
        'cost_price': 100,
        'price': 150,
        'vat_rate': 20,
    })
    assert created.status_code == 201, created.data
    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'status': 'completed'})
    assert response.status_code == 200, response.data
    log = AuditLog.objects.get(action='SYSTEM', entity_type='stock_item', entity_id=stock.pk)
    assert log.user_id is None
    assert log.details['event'] == 'stock_deducted'
    assert log.details['order_id'] == order.pk
    assert log.details['quantity'] == 2


@pytest.mark.django_db
def test_order_detail_includes_client_phone():
    from clients.models import Client, ClientPhone

    user = User.objects.create_user(
        username='ord_phone', email='ordp@test.com', password='pwd', role='manager',
    )
    client = Client.objects.create(first_name='Анна', last_name='Козлова', seller=user)
    phone = ClientPhone.objects.create(client=client, number='+375291112233', is_primary=True)
    channel = SalesChannel.objects.create(name='Сайт')
    order = _make_order(user, channel, number=91)
    order.client = client
    order.save(update_fields=['client'])

    api = APIClient()
    api.force_authenticate(user=user)
    response = api.get(f'/api/v1/orders/orders/{order.pk}/')
    assert response.status_code == 200, response.data
    assert response.data['client_phone'] == '+375291112233'
    assert response.data['client_phone_id'] == phone.pk


@pytest.mark.django_db
def test_seller_can_create_delivery_service():
    from orders.models import DeliveryService

    seller = User.objects.create_user(
        username='del_s', email='dels@test.com', password='pwd', role='seller',
    )
    api = APIClient()
    api.force_authenticate(user=seller)
    response = api.post('/api/v1/orders/delivery_services/', {'name': 'Европочта экспресс'})
    assert response.status_code == 201, response.data
    assert DeliveryService.objects.filter(name='Европочта экспресс').count() == 1

    again = api.post('/api/v1/orders/delivery_services/', {'name': 'Европочта экспресс'})
    assert again.status_code in (200, 201), again.data
    assert DeliveryService.objects.filter(name='Европочта экспресс').count() == 1


@pytest.mark.django_db
def test_order_can_have_multiple_delivery_rows():
    from orders.models import DeliveryService

    user = User.objects.create_user(
        username='del_rows', email='delrows@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    order = _make_order(user, channel, number=92)
    courier = DeliveryService.objects.create(name='Курьер')
    euro = DeliveryService.objects.create(name='Европочта')

    api = APIClient()
    api.force_authenticate(user=user)
    first = api.post('/api/v1/orders/order_deliveries/', {
        'order': order.pk,
        'delivery_service': courier.pk,
        'tracking_number': 'TR-1',
        'delivery_date': '2026-08-20',
    })
    second = api.post('/api/v1/orders/order_deliveries/', {
        'order': order.pk,
        'delivery_service': euro.pk,
        'tracking_number': 'TR-2',
    })
    assert first.status_code == 201, first.data
    assert second.status_code == 201, second.data
    assert first.data['delivery_date'] == '2026-08-20'
    assert second.data['delivery_date'] is None

    patched = api.patch(f'/api/v1/orders/order_deliveries/{second.data["id"]}/', {
        'delivery_date': '2026-08-22',
    })
    assert patched.status_code == 200, patched.data
    assert patched.data['delivery_date'] == '2026-08-22'

    detail = api.get(f'/api/v1/orders/orders/{order.pk}/')
    assert detail.status_code == 200
    rows = detail.data['deliveries']
    assert len(rows) == 2
    assert {row['tracking_number'] for row in rows} == {'TR-1', 'TR-2'}


@pytest.mark.django_db
def test_order_item_includes_product_preview_fields():
    user = User.objects.create_user(
        username='preview', email='preview@test.com', password='pwd', role='manager',
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Spirit II', sku='SP-2', category=category, supplier=supplier,
        base_cost_price=100, rrp=240, dimensions='110x70x60', weight=45,
        grill_type='gas',
    )
    StockItem.objects.create(product_card=product, stock_quantity=5)
    channel = SalesChannel.objects.create(name='Сайт')
    from clients.models import Client
    client = Client.objects.create(first_name='Анна', seller=user)
    order = _make_order(user, channel, number=93)
    order.client = client
    order.save(update_fields=['client'])

    api = APIClient()
    api.force_authenticate(user=user)
    response = api.post(ORDER_ITEMS_URL, {
        'order': order.pk,
        'product_card': product.pk,
        'quantity': 1,
        'cost_price': 100,
        'price': 200,
        'vat_rate': 20,
    })
    assert response.status_code == 201, response.data
    assert response.data['product_name'] == 'Spirit II'
    assert response.data['product_sku'] == 'SP-2'
    assert response.data['product_category_name'] == 'Грили'
    assert response.data['product_grill_type'] == 'gas'
    assert response.data['product_dimensions'] == '110x70x60'
    assert response.data['product_weight'] == '45.00'
    assert response.data['product_supplier_name'] == 'Weber'


@pytest.mark.django_db
def test_second_reserved_order_cannot_overcommit_stock():
    user = User.objects.create_user(
        username='over', email='over@test.com', password='pwd', role='manager',
    )
    category = ProductCategory.objects.create(name='Грили')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-OV', category=category, supplier=supplier, base_cost_price=100,
    )
    StockItem.objects.create(product_card=product, stock_quantity=5)
    channel = SalesChannel.objects.create(name='Сайт')
    first = _make_order(user, channel, number=201)
    second = _make_order(user, channel, number=202)
    api = APIClient()
    api.force_authenticate(user=user)

    ok = api.post(ORDER_ITEMS_URL, {
        'order': first.pk, 'product_card': product.pk,
        'quantity': 5, 'cost_price': 100, 'price': 150, 'vat_rate': 20,
    })
    assert ok.status_code == 201, ok.data

    blocked = api.post(ORDER_ITEMS_URL, {
        'order': second.pk, 'product_card': product.pk,
        'quantity': 5, 'cost_price': 100, 'price': 150, 'vat_rate': 20,
    })
    assert blocked.status_code == 400
    assert second.items.count() == 0


@pytest.mark.django_db
def test_cannot_change_header_of_completed_order():
    user = User.objects.create_user(
        username='freeze', email='freeze@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    other = SalesChannel.objects.create(name='Другой')
    order = _make_order(user, channel, number=203)
    order.status = Order.Status.COMPLETED
    order.save(update_fields=['status'])
    api = APIClient()
    api.force_authenticate(user=user)

    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {
        'discount_percent': '15.00',
        'sales_channel': other.pk,
    })
    assert response.status_code == 400
    order.refresh_from_db()
    assert order.discount_percent == 0
    assert order.sales_channel_id == channel.pk


@pytest.mark.django_db
def test_comment_allowed_on_completed_order():
    user = User.objects.create_user(
        username='cmt', email='cmt@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    order = _make_order(user, channel, number=204)
    order.status = Order.Status.COMPLETED
    order.save(update_fields=['status'])
    api = APIClient()
    api.force_authenticate(user=user)

    response = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'comment': 'ок'})
    assert response.status_code == 200, response.data
    order.refresh_from_db()
    assert order.comment == 'ок'


@pytest.mark.django_db
def test_order_number_assigned_when_omitted():
    user = User.objects.create_user(
        username='num', email='num@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    first = Order.objects.create(
        order_date=timezone.now().date(), seller=user, sales_channel=channel, created_by=user,
    )
    second = Order.objects.create(
        order_date=timezone.now().date(), seller=user, sales_channel=channel, created_by=user,
    )
    assert first.order_number >= 1
    assert second.order_number == first.order_number + 1


@pytest.mark.django_db
def test_order_seller_name_is_last_and_first():
    user = User.objects.create_user(
        username='fio', email='fio@test.com', password='pwd', role='manager',
        first_name='Иван', last_name='Петров',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    order = _make_order(user, channel, number=210)
    api = APIClient()
    api.force_authenticate(user=user)
    response = api.get(f'/api/v1/orders/orders/{order.pk}/')
    assert response.status_code == 200, response.data
    assert response.data['seller_name'] == 'Петров Иван'


@pytest.mark.django_db
def test_order_list_filters_by_order_date():
    user = User.objects.create_user(
        username='odate', email='odate@test.com', password='pwd', role='manager',
    )
    channel = SalesChannel.objects.create(name='Сайт')
    august = Order.objects.create(
        order_number=301, order_date=date(2026, 8, 12), status=Order.Status.RESERVED,
        seller=user, sales_channel=channel, created_by=user,
    )
    january = Order.objects.create(
        order_number=302, order_date=date(2026, 1, 10), status=Order.Status.RESERVED,
        seller=user, sales_channel=channel, created_by=user,
    )
    api = APIClient()
    api.force_authenticate(user=user)

    by_range = api.get('/api/v1/orders/orders/', {
        'order_date_after': '2026-08-01',
        'order_date_before': '2026-08-31',
    })
    assert by_range.status_code == 200
    ids = [row['id'] for row in by_range.data['results']]
    assert august.pk in ids
    assert january.pk not in ids

    by_from = api.get('/api/v1/orders/orders/', {'order_date_after': '2026-08-01'})
    assert by_from.status_code == 200
    from_ids = [row['id'] for row in by_from.data['results']]
    assert august.pk in from_ids
    assert january.pk not in from_ids

