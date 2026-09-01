import pytest
from rest_framework.test import APIClient
from users.models import User
from clients.models import Client, ClientPhone

PHONES_URL = '/api/v1/clients/client_phones/'


@pytest.mark.django_db
def test_create_client_with_phone_write_only_field():
    user = User.objects.create_user(username='s', email='s@t.com', password='pwd', role='seller')
    api = APIClient()
    api.force_authenticate(user=user)
    res = api.post('/api/v1/clients/clients/', {
        'first_name': 'Иван',
        'phone': '+375291112233',
        'phone_comment': 'WhatsApp',
    })
    assert res.status_code == 201, res.data
    assert res.data['primary_phone'] == '+375291112233'
    phone = ClientPhone.objects.get(client_id=res.data['id'], number='+375291112233')
    assert phone.is_primary is True
    assert phone.comment == 'WhatsApp'


@pytest.mark.django_db
def test_patch_phone_number_and_comment():
    manager = User.objects.create_user(username='ph_mgr', email='phm@test.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='Анна', seller=manager)
    phone = ClientPhone.objects.create(client=client, number='+375290000001', comment='рабочий', is_primary=True)

    api = APIClient()
    api.force_authenticate(user=manager)
    res = api.patch(f'{PHONES_URL}{phone.pk}/', {
        'number': '+375291112244',
        'comment': 'WhatsApp',
    })
    assert res.status_code == 200, res.data
    phone.refresh_from_db()
    assert phone.number == '+375291112244'
    assert phone.comment == 'WhatsApp'


@pytest.mark.django_db
def test_setting_primary_phone_unsets_previous():
    manager = User.objects.create_user(username='ph_pri', email='php@test.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='Олег', seller=manager)
    first = ClientPhone.objects.create(client=client, number='+375290000010', is_primary=True)
    second = ClientPhone.objects.create(client=client, number='+375290000011', is_primary=False)

    api = APIClient()
    api.force_authenticate(user=manager)
    res = api.patch(f'{PHONES_URL}{second.pk}/', {'is_primary': True})
    assert res.status_code == 200, res.data
    first.refresh_from_db()
    second.refresh_from_db()
    assert second.is_primary is True
    assert first.is_primary is False
