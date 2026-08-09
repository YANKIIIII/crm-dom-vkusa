import pytest
from rest_framework.test import APIClient
from users.models import User
from clients.models import ClientPhone

@pytest.mark.django_db
def test_create_client_with_phone_write_only_field():
    user = User.objects.create_user(username='s', email='s@t.com', password='pwd', role='seller')
    api = APIClient()
    api.force_authenticate(user=user)
    res = api.post('/api/v1/clients/clients/', {
        'first_name': 'Иван',
        'phone': '+375291112233',
    })
    assert res.status_code == 201, res.data
    assert res.data['primary_phone'] == '+375291112233'
    assert ClientPhone.objects.filter(client_id=res.data['id'], number='+375291112233', is_primary=True).exists()
