import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from orders.models import Order, SalesChannel
from orders.views import OrderViewSet
from users.models import User

ORDERS_URL = '/api/v1/orders/orders/'


def _make_order(user, channel, number, status):
    return Order.objects.create(
        order_number=number,
        order_date=timezone.now().date(),
        status=status,
        seller=user,
        sales_channel=channel,
        created_by=user,
    )


@pytest.fixture
def api_env(db):
    user = User.objects.create_user(
        username='statususer', email='status@test.com', password='pwd',
        role='manager', first_name='Status',
    )
    channel = SalesChannel.objects.create(name="Status Channel")
    api = APIClient()
    api.force_authenticate(user=user)
    return api, user, channel


@pytest.mark.django_db
def test_reserved_to_confirmed_allowed(api_env):
    api, user, channel = api_env
    order = _make_order(user, channel, 9001, Order.Status.RESERVED)

    response = api.patch(f'{ORDERS_URL}{order.pk}/', {'status': 'confirmed'})

    assert response.status_code == 200, response.data
    order.refresh_from_db()
    assert order.status == Order.Status.CONFIRMED


@pytest.mark.django_db
def test_completed_to_reserved_rejected(api_env):
    api, user, channel = api_env
    order = _make_order(user, channel, 9002, Order.Status.COMPLETED)

    response = api.patch(f'{ORDERS_URL}{order.pk}/', {'status': 'reserved'})

    assert response.status_code == 400
    order.refresh_from_db()
    assert order.status == Order.Status.COMPLETED


@pytest.mark.django_db
def test_cancelled_to_reserved_rejected(api_env):
    api, user, channel = api_env
    order = _make_order(user, channel, 9003, Order.Status.CANCELLED)

    response = api.patch(f'{ORDERS_URL}{order.pk}/', {'status': 'reserved'})

    assert response.status_code == 400
    order.refresh_from_db()
    assert order.status == Order.Status.CANCELLED


@pytest.mark.django_db
def test_cancelled_same_status_save_allowed(api_env):
    api, user, channel = api_env
    order = _make_order(user, channel, 9004, Order.Status.CANCELLED)

    # Same status plus another field: not a transition, must succeed.
    response = api.patch(
        f'{ORDERS_URL}{order.pk}/',
        {'status': 'cancelled', 'comment': 'Комментарий к отмененному заказу'},
    )

    assert response.status_code == 200, response.data
    order.refresh_from_db()
    assert order.status == Order.Status.CANCELLED
    assert order.comment == 'Комментарий к отмененному заказу'


@pytest.mark.django_db
def test_reserved_to_completed_rejected(api_env):
    api, user, channel = api_env
    order = _make_order(user, channel, 9005, Order.Status.RESERVED)

    response = api.patch(f'{ORDERS_URL}{order.pk}/', {'status': 'completed'})

    assert response.status_code == 400
    order.refresh_from_db()
    assert order.status == Order.Status.RESERVED


@pytest.mark.django_db
def test_status_validation_uses_locked_fresh_status(api_env, monkeypatch):
    """Update re-reads status under select_for_update before validate_status.

    Simulates a concurrent status change after get_object() but before lock:
    stale instance would allow confirmed→cancelled; locked fresh COMPLETED must
    reject. The mid-flight UPDATE shares the request transaction and rolls back
    with the 400, so the order remains CONFIRMED — and must not become CANCELLED.
    """
    api, user, channel = api_env
    order = _make_order(user, channel, 9006, Order.Status.CONFIRMED)

    original_get_object = OrderViewSet.get_object

    def get_object_then_race(self):
        instance = original_get_object(self)
        Order.objects.filter(pk=order.pk).update(status=Order.Status.COMPLETED)
        return instance

    monkeypatch.setattr(OrderViewSet, 'get_object', get_object_then_race)

    response = api.patch(f'{ORDERS_URL}{order.pk}/', {'status': 'cancelled'})

    assert response.status_code == 400
    order.refresh_from_db()
    assert order.status == Order.Status.CONFIRMED
