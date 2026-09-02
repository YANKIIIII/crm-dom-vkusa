import pytest
from rest_framework.test import APIClient
from catalog.models import ProductCard, ProductCategory, Supplier
from orders.models import DeliveryService, Order, OrderItem, OrderStatus, PaymentType, SalesChannel
from users.models import User
from warehouse.models import StockItem
from warehouse.services import WarehouseService

CHANNELS_URL = '/api/v1/orders/sales_channels/'
PAYMENTS_URL = '/api/v1/orders/payment_types/'
DELIVERIES_URL = '/api/v1/orders/delivery_services/'
STATUSES_URL = '/api/v1/orders/order_statuses/'
ORDERS_URL = '/api/v1/orders/orders/'
CATEGORIES_URL = '/api/v1/catalog/product_categories/'


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _users():
    manager = User.objects.create_user(
        username='ref_mgr', email='refmgr@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='ref_sel', email='refsel@test.com', password='pwd', role='seller',
    )
    return manager, seller


@pytest.mark.django_db
def test_manager_can_create_and_rename_sales_channel():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(CHANNELS_URL, {'name': 'Instagram'})
    assert created.status_code == 201, created.data
    channel_id = created.data['id']
    patched = api.patch(f'{CHANNELS_URL}{channel_id}/', {'name': 'Instagram Ads'})
    assert patched.status_code == 200, patched.data
    assert patched.data['name'] == 'Instagram Ads'


@pytest.mark.django_db
def test_seller_cannot_create_sales_channel_or_payment_type():
    _, seller = _users()
    api = _api(seller)
    channel = api.post(CHANNELS_URL, {'name': 'TikTok'})
    assert channel.status_code == 403
    payment = api.post(PAYMENTS_URL, {'name': 'Крипта'})
    assert payment.status_code == 403
    listed = api.get(CHANNELS_URL)
    assert listed.status_code == 200


@pytest.mark.django_db
def test_cannot_delete_sales_channel_used_by_order():
    manager, _ = _users()
    channel = SalesChannel.objects.create(name='Сайт')
    Order.objects.create(
        order_number=501,
        order_date='2026-01-01',
        status=Order.Status.RESERVED,
        seller=manager,
        sales_channel=channel,
        created_by=manager,
    )
    api = _api(manager)
    response = api.delete(f'{CHANNELS_URL}{channel.pk}/')
    assert response.status_code == 400
    assert SalesChannel.objects.filter(pk=channel.pk).exists()


@pytest.mark.django_db
def test_manager_can_create_payment_and_delivery():
    manager, _ = _users()
    api = _api(manager)
    payment = api.post(PAYMENTS_URL, {'name': 'ЕРИП'})
    assert payment.status_code == 201, payment.data
    delivery = api.post(DELIVERIES_URL, {'name': 'Белпочта'})
    assert delivery.status_code in (200, 201), delivery.data


@pytest.mark.django_db
def test_manager_can_create_product_category_by_name_only():
    manager, seller = _users()
    ok = _api(manager).post(CATEGORIES_URL, {'name': 'Запчасти'})
    assert ok.status_code == 201, ok.data
    assert ok.data['name'] == 'Запчасти'
    assert ok.data['code']
    denied = _api(seller).post(CATEGORIES_URL, {'name': 'Секрет'})
    assert denied.status_code == 403


@pytest.mark.django_db
def test_manager_can_create_open_order_status_and_assign_it():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(STATUSES_URL, {'name': 'Ждёт звонка'})
    assert created.status_code == 201, created.data
    assert created.data['is_system'] is False
    assert created.data['kind'] == 'open'
    assert created.data['code']
    assert created.data['code'] != 'Ждёт звонка'

    order = Order.objects.create(
        order_number=502,
        order_date='2026-01-01',
        status=Order.Status.RESERVED,
        seller=manager,
        created_by=manager,
    )
    patched = api.patch(f'{ORDERS_URL}{order.pk}/', {'status': created.data['code']})
    assert patched.status_code == 200, patched.data
    assert patched.data['status'] == created.data['code']
    assert patched.data['status_display'] == 'Ждёт звонка'


@pytest.mark.django_db
def test_seller_cannot_create_order_status():
    _, seller = _users()
    response = _api(seller).post(STATUSES_URL, {'name': 'На паузе'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_cannot_delete_or_recode_system_order_status():
    manager, _ = _users()
    status = OrderStatus.objects.get(code='reserved')
    assert status.is_system
    api = _api(manager)
    deleted = api.delete(f'{STATUSES_URL}{status.pk}/')
    assert deleted.status_code == 400
    assert OrderStatus.objects.filter(pk=status.pk).exists()

    patched = api.patch(f'{STATUSES_URL}{status.pk}/', {
        'code': 'new_reserved',
        'kind': 'cancelled',
        'name': 'Нераспределённые',
    })
    assert patched.status_code == 200, patched.data
    status.refresh_from_db()
    assert status.code == 'reserved'
    assert status.kind == OrderStatus.Kind.OPEN
    assert status.name == 'Нераспределённые'


@pytest.mark.django_db
def test_manager_can_create_order_status_with_kind():
    manager, _ = _users()
    response = _api(manager).post(STATUSES_URL, {
        'name': 'Продано',
        'kind': 'completed',
    })
    assert response.status_code == 201, response.data
    assert response.data['kind'] == 'completed'
    assert response.data['code']
    assert response.data['code'] != 'Продано'


@pytest.mark.django_db
def test_manager_can_change_kind_of_custom_status_but_not_system():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(STATUSES_URL, {'name': 'На паузе', 'kind': 'open'})
    assert created.status_code == 201, created.data
    patched = api.patch(f'{STATUSES_URL}{created.data["id"]}/', {'kind': 'cancelled'})
    assert patched.status_code == 200, patched.data
    assert patched.data['kind'] == 'cancelled'

    reserved = OrderStatus.objects.get(code='reserved')
    locked = api.patch(f'{STATUSES_URL}{reserved.pk}/', {'kind': 'cancelled'})
    assert locked.status_code == 200, locked.data
    reserved.refresh_from_db()
    assert reserved.kind == OrderStatus.Kind.OPEN


@pytest.mark.django_db
def test_custom_open_status_holds_stock_like_reserved():
    manager, _ = _users()
    OrderStatus.objects.create(
        code='waiting_call', name='Ждёт звонка', kind=OrderStatus.Kind.OPEN, sort_order=15,
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='ST-1', category=category, supplier=supplier, base_cost_price=100,
    )
    StockItem.objects.create(product_card=product, stock_quantity=2)
    first = Order.objects.create(
        order_number=503,
        order_date='2026-01-01',
        status='waiting_call',
        seller=manager,
        created_by=manager,
    )
    OrderItem.objects.create(
        order=first, product_card=product, quantity=2, cost_price=100, price=150, vat_rate=20,
    )
    second = Order.objects.create(
        order_number=504,
        order_date='2026-01-01',
        status=Order.Status.RESERVED,
        seller=manager,
        created_by=manager,
    )
    extra = OrderItem(
        order=second, product_card=product, quantity=1, cost_price=100, price=150, vat_rate=20,
    )
    with pytest.raises(Exception) as exc:
        WarehouseService.assert_stock_available(extra)
    assert 'Недостаточно' in str(exc.value)


@pytest.mark.django_db
def test_cannot_change_kind_of_status_used_by_orders():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(STATUSES_URL, {'name': 'Ждёт звонка', 'kind': 'open'})
    assert created.status_code == 201, created.data
    code = created.data['code']
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='ST-K1', category=category, supplier=supplier, base_cost_price=100,
    )
    StockItem.objects.create(product_card=product, stock_quantity=2)
    order = Order.objects.create(
        order_number=505,
        order_date='2026-01-01',
        status=code,
        seller=manager,
        created_by=manager,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=2, cost_price=100, price=150, vat_rate=20,
    )
    patched = api.patch(f'{STATUSES_URL}{created.data["id"]}/', {'kind': 'cancelled'})
    assert patched.status_code == 400, patched.data
    status = OrderStatus.objects.get(pk=created.data['id'])
    assert status.kind == OrderStatus.Kind.OPEN
    second = Order.objects.create(
        order_number=506,
        order_date='2026-01-01',
        status=Order.Status.RESERVED,
        seller=manager,
        created_by=manager,
    )
    extra = OrderItem(
        order=second, product_card=product, quantity=1, cost_price=100, price=150, vat_rate=20,
    )
    with pytest.raises(Exception) as exc:
        WarehouseService.assert_stock_available(extra)
    assert 'Недостаточно' in str(exc.value)
