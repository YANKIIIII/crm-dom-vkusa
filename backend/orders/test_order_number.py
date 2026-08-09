import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from orders.models import Order, SalesChannel

@pytest.mark.django_db
def test_create_order_auto_assigns_order_number():
    user = User.objects.create_user(username='s1', email='s1@t.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    api = APIClient()
    api.force_authenticate(user=user)
    res = api.post('/api/v1/orders/orders/', {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
    })
    assert res.status_code == 201, res.data
    assert res.data['order_number'] >= 1
    assert Order.objects.get(pk=res.data['id']).seller_id == user.id
