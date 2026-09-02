import pytest
from rest_framework.test import APIClient
from clients.models import Client, ClientPhone
from users.models import User

CLIENTS_URL = '/api/v1/clients/clients/'
CLIENT_PHONES_URL = '/api/v1/clients/client_phones/'


def _api_for(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.mark.django_db
def test_seller_cannot_reassign_client_seller_on_update():
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    client = Client.objects.create(first_name='Ivan', seller=seller1)

    api = _api_for(seller1)
    response = api.patch(f'{CLIENTS_URL}{client.pk}/', {
        'first_name': 'Ivan Updated',
        'seller': seller2.pk,
    })

    assert response.status_code == 200, response.data
    client.refresh_from_db()
    assert client.first_name == 'Ivan Updated'
    # The seller field must stay pinned to the requesting seller
    assert client.seller == seller1


@pytest.mark.django_db
def test_seller_sees_all_clients():
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    own = Client.objects.create(first_name='Ivan', seller=seller1)
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)

    api = _api_for(seller1)
    response = api.get(CLIENTS_URL)

    assert response.status_code == 200, response.data
    ids = [row['id'] for row in response.data['results']]
    assert own.pk in ids
    assert foreign_client.pk in ids


@pytest.mark.django_db
def test_seller_can_patch_other_sellers_client():
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)

    api = _api_for(seller1)
    response = api.patch(f'{CLIENTS_URL}{foreign_client.pk}/', {'first_name': 'Pyotr'})

    assert response.status_code == 200, response.data
    foreign_client.refresh_from_db()
    assert foreign_client.first_name == 'Pyotr'
    assert foreign_client.seller == seller2


@pytest.mark.django_db
def test_seller_can_edit_other_sellers_client_phone():
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)
    phone = ClientPhone.objects.create(client=foreign_client, number='+70000000001', is_primary=True)

    api = _api_for(seller1)
    response = api.patch(f'{CLIENT_PHONES_URL}{phone.pk}/', {'number': '+70000000099'})

    assert response.status_code == 200, response.data
    phone.refresh_from_db()
    assert phone.number == '+70000000099'


@pytest.mark.django_db
def test_seller_can_post_phone_onto_other_sellers_client():
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    foreign_client = Client.objects.create(first_name='Petr', seller=seller2)

    api = _api_for(seller1)
    response = api.post(CLIENT_PHONES_URL, {
        'client': foreign_client.pk,
        'number': '+70000000002',
        'is_primary': True,
    })

    assert response.status_code == 201, response.data
    assert ClientPhone.objects.filter(client=foreign_client, number='+70000000002').exists()


@pytest.mark.django_db
def test_manager_can_reassign_client_seller():
    manager = User.objects.create_user(username='manager1', email='m1@test.com', password='pwd', role='manager')
    seller1 = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    client = Client.objects.create(first_name='Ivan', seller=seller1)

    api = _api_for(manager)
    response = api.patch(f'{CLIENTS_URL}{client.pk}/', {'seller': seller2.pk})

    assert response.status_code == 200, response.data
    client.refresh_from_db()
    assert client.seller == seller2
