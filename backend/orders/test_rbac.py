import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from clients.models import Client
from orders.models import Order, SalesChannel
from catalog.models import ProductCard, ProductCategory, Supplier
from warehouse.models import StockItem
from users.models import User

ORDER_ITEMS_URL = '/api/v1/orders/order_items/'
ORDERS_URL = '/api/v1/orders/orders/'


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
    category = ProductCategory.objects.create(name='Grills', code='B')
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

    # Re-pointing into another seller's order is allowed (all sellers may edit any order)
    response = api.patch(f'{ORDER_ITEMS_URL}{item_id}/', {'order': foreign_order.pk})
    assert response.status_code == 200, response.data
    assert own_order.items.count() == 0
    assert foreign_order.items.count() == 1


@pytest.mark.django_db
def test_seller_can_bind_other_sellers_client_on_create():
    seller1 = User.objects.create_user(username='s_own', email='own@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='s_other', email='other@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)

    api = APIClient()
    api.force_authenticate(user=seller1)
    response = api.post(ORDERS_URL, {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
        'client': foreign_client.pk,
    })
    assert response.status_code == 201, response.data
    assert response.data['client'] == foreign_client.pk


@pytest.mark.django_db
def test_seller_can_bind_other_sellers_client_on_update():
    seller1 = User.objects.create_user(username='s_own2', email='own2@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='s_other2', email='other2@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    own_client = Client.objects.create(first_name='Ivan', seller=seller1)
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)
    order = _make_order(seller1, channel, number=9001)
    order.client = own_client
    order.save(update_fields=['client'])

    api = APIClient()
    api.force_authenticate(user=seller1)
    response = api.patch(f'{ORDERS_URL}{order.pk}/', {'client': foreign_client.pk})
    assert response.status_code == 200, response.data
    order.refresh_from_db()
    assert order.client_id == foreign_client.pk


@pytest.mark.django_db
def test_seller_can_bind_own_client_on_create():
    seller1 = User.objects.create_user(username='s_ok', email='ok@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    own_client = Client.objects.create(first_name='Ivan', seller=seller1)

    api = APIClient()
    api.force_authenticate(user=seller1)
    response = api.post(ORDERS_URL, {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
        'client': own_client.pk,
    })
    assert response.status_code == 201, response.data
    assert response.data['client'] == own_client.pk


@pytest.mark.django_db
def test_manager_can_bind_any_client_on_create():
    manager = User.objects.create_user(username='mgr_bind', email='mgrb@test.com', password='pwd', role='manager')
    seller2 = User.objects.create_user(username='s_for_mgr', email='sfm@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)

    api = APIClient()
    api.force_authenticate(user=manager)
    response = api.post(ORDERS_URL, {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
        'client': foreign_client.pk,
    })
    assert response.status_code == 201, response.data
    assert response.data['client'] == foreign_client.pk


@pytest.mark.django_db
def test_seller_can_list_other_sellers_orders():
    seller1 = User.objects.create_user(username='s_list1', email='l1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='s_list2', email='l2@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    foreign = _make_order(seller2, channel, number=8001)

    api = APIClient()
    api.force_authenticate(user=seller1)
    response = api.get(ORDERS_URL)
    assert response.status_code == 200
    ids = [row['id'] for row in response.data['results']]
    assert foreign.pk in ids


@pytest.mark.django_db
def test_seller_can_patch_other_sellers_order_without_stealing_seller():
    seller1 = User.objects.create_user(username='s_p1', email='p1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='s_p2', email='p2@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    foreign = _make_order(seller2, channel, number=8002)

    api = APIClient()
    api.force_authenticate(user=seller1)
    response = api.patch(f'{ORDERS_URL}{foreign.pk}/', {'comment': 'ok'})
    assert response.status_code == 200, response.data
    foreign.refresh_from_db()
    assert foreign.comment == 'ok'
    assert foreign.seller_id == seller2.id


@pytest.mark.django_db
def test_seller_cannot_reassign_seller_on_update():
    seller1 = User.objects.create_user(username='s_steal1', email='st1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='s_steal2', email='st2@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    foreign = _make_order(seller2, channel, number=8010)

    api = APIClient()
    api.force_authenticate(user=seller1)
    response = api.patch(f'{ORDERS_URL}{foreign.pk}/', {'seller': seller1.pk, 'comment': 'mine'})
    assert response.status_code == 200, response.data
    foreign.refresh_from_db()
    assert foreign.seller_id == seller2.id
    assert foreign.comment == 'mine'


@pytest.mark.django_db
def test_manager_can_assign_seller_on_create_and_update():
    manager = User.objects.create_user(username='mgr_asg', email='mgrasg@test.com', password='pwd', role='manager')
    seller = User.objects.create_user(username='s_asg', email='sasg@test.com', password='pwd', role='seller')
    other = User.objects.create_user(username='s_asg2', email='sasg2@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')

    api = APIClient()
    api.force_authenticate(user=manager)
    response = api.post(ORDERS_URL, {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
        'seller': seller.pk,
    })
    assert response.status_code == 201, response.data
    assert response.data['seller'] == seller.pk

    order_id = response.data['id']
    response = api.patch(f'{ORDERS_URL}{order_id}/', {'seller': other.pk})
    assert response.status_code == 200, response.data
    assert response.data['seller'] == other.pk


@pytest.mark.django_db
def test_seller_cannot_delete_orders():
    seller1 = User.objects.create_user(username='s_d1', email='d1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='s_d2', email='d2@test.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    own = _make_order(seller1, channel, number=8003)
    foreign = _make_order(seller2, channel, number=8004)

    api = APIClient()
    api.force_authenticate(user=seller1)
    assert api.delete(f'{ORDERS_URL}{own.pk}/').status_code == 403
    assert api.delete(f'{ORDERS_URL}{foreign.pk}/').status_code == 403
    assert Order.objects.filter(pk__in=[own.pk, foreign.pk]).count() == 2
