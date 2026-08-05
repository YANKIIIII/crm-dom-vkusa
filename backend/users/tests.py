import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from users.models import User

@pytest.mark.django_db
def test_manager_can_access_users():
    client = APIClient()
    manager = User.objects.create_user(username='mgr', email='mgr@test.com', password='pwd', role='manager')
    client.force_authenticate(user=manager)
    
    response = client.get('/api/v1/users/users/')
    assert response.status_code == 200

@pytest.mark.django_db
def test_seller_cannot_access_users():
    client = APIClient()
    seller = User.objects.create_user(username='sel', email='sel@test.com', password='pwd', role='seller')
    client.force_authenticate(user=seller)
    
    response = client.get('/api/v1/users/users/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_user_create_sets_usable_hashed_password():
    client = APIClient()
    manager = User.objects.create_user(username='mgr2', email='mgr2@test.com', password='pwd', role='manager')
    client.force_authenticate(user=manager)

    response = client.post('/api/v1/users/users/', {
        'username': 'newseller',
        'email': 'new@test.com',
        'role': 'seller',
        'password': 'S3cret!pass',
    })
    assert response.status_code == 201, response.data
    assert 'password' not in response.data  # write_only

    created = User.objects.get(username='newseller')
    assert created.check_password('S3cret!pass')


@pytest.mark.django_db
def test_user_update_rehashes_password():
    client = APIClient()
    manager = User.objects.create_user(username='mgr3', email='mgr3@test.com', password='pwd', role='manager')
    target = User.objects.create_user(username='target', email='t@test.com', password='oldpass', role='seller')
    client.force_authenticate(user=manager)

    response = client.patch(f'/api/v1/users/users/{target.pk}/', {'password': 'newpass123'})
    assert response.status_code == 200, response.data

    target.refresh_from_db()
    assert target.check_password('newpass123')
    assert not target.check_password('oldpass')
