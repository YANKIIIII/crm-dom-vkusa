import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from clients.models import Client
from orders.models import Order, SalesChannel


@pytest.mark.django_db
def test_client_total_budget_not_writable_via_api():
    mgr = User.objects.create_user(username='m', email='m@t.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='A', total_budget=0, seller=mgr)
    api = APIClient()
    api.force_authenticate(user=mgr)
    res = api.patch(f'/api/v1/clients/clients/{client.pk}/', {'total_budget': '99999.00'})
    assert res.status_code == 200
    client.refresh_from_db()
    assert float(client.total_budget) == 0.0


@pytest.mark.django_db
def test_order_completed_at_not_writable_via_api():
    user = User.objects.create_user(username='s1', email='s1@t.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    api = APIClient()
    api.force_authenticate(user=user)
    res = api.post('/api/v1/orders/orders/', {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
    })
    assert res.status_code == 201, res.data
    order = Order.objects.get(pk=res.data['id'])
    assert order.completed_at is None

    fake_completed = timezone.now().isoformat()
    res = api.patch(f'/api/v1/orders/orders/{order.pk}/', {'completed_at': fake_completed})
    assert res.status_code == 200, res.data
    order.refresh_from_db()
    assert order.completed_at is None
