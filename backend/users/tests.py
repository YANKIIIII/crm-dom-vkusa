import pytest
from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APIClient

from common.models import AuditLog
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
    login = client.post('/api/v1/token/', {'username': 'target', 'password': 'oldpass'})
    assert login.status_code == 200
    refresh = login.data['refresh']
    client.force_authenticate(user=manager)

    response = client.patch(f'/api/v1/users/users/{target.pk}/', {'password': 'newpass123'})
    assert response.status_code == 200, response.data

    target.refresh_from_db()
    assert target.check_password('newpass123')
    assert not target.check_password('oldpass')

    reused = client.post('/api/v1/token/refresh/', {'refresh': refresh})
    assert reused.status_code in (400, 401)

    client.force_authenticate(user=None)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
    denied = client.get('/api/v1/users/users/me/')
    assert denied.status_code in (401, 403)


@pytest.mark.django_db
def test_manager_cannot_delete_self():
    client = APIClient()
    manager = User.objects.create_user(username='mgr4', email='mgr4@test.com', password='pwd', role='manager')
    client.force_authenticate(user=manager)
    response = client.delete(f'/api/v1/users/users/{manager.pk}/')
    assert response.status_code == 400
    assert User.objects.filter(pk=manager.pk).exists()


@pytest.mark.django_db
def test_login_writes_audit_log():
    User.objects.create_user(username='loginuser', email='lu@test.com', password='pwd', role='seller')
    client = APIClient()
    response = client.post('/api/v1/token/', {'username': 'loginuser', 'password': 'pwd'})
    assert response.status_code == 200
    assert AuditLog.objects.filter(action='LOGIN', entity_type='user').exists()
    log = AuditLog.objects.filter(action='LOGIN', entity_type='user').latest('id')
    assert log.details['status'] == 'success'


@pytest.mark.django_db
def test_failed_login_writes_audit_log():
    user = User.objects.create_user(username='badlogin', email='bl@test.com', password='pwd', role='seller')
    client = APIClient()
    response = client.post('/api/v1/token/', {'username': 'badlogin', 'password': 'wrong'})
    assert response.status_code == 401
    log = AuditLog.objects.get(action='LOGIN', entity_id=user.pk)
    assert log.details['status'] == 'failure'
    assert log.user_id == user.pk


@pytest.mark.django_db
def test_unknown_user_failed_login_writes_audit_log():
    client = APIClient()
    response = client.post('/api/v1/token/', {'username': 'ghost', 'password': 'wrong'})
    assert response.status_code == 401
    log = AuditLog.objects.get(action='LOGIN', entity_type='user', entity_id=0)
    assert log.user_id is None
    assert log.details['status'] == 'failure'
    assert log.details['username'] == 'ghost'


@pytest.fixture(autouse=True)
def _clear_auth_throttle_cache():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_login_lockout_after_five_failures():
    from users.models import AuthLock

    User.objects.create_user(username='locked', email='lk@test.com', password='correct', role='seller')
    client = APIClient()
    for _ in range(5):
        response = client.post('/api/v1/token/', {'username': 'locked', 'password': 'wrong'})
        assert response.status_code == 401

    lock = AuthLock.objects.get(username='locked')
    assert lock.locked_until is not None

    from django.core.cache import cache
    cache.clear()
    blocked = client.post('/api/v1/token/', {'username': 'locked', 'password': 'correct'})
    assert blocked.status_code == 403
    assert '15' in str(blocked.data)


@pytest.mark.django_db
def test_login_throttled_after_five_attempts_per_minute():
    User.objects.create_user(username='thr', email='thr@test.com', password='pwd', role='seller')
    client = APIClient()
    statuses = [
        client.post('/api/v1/token/', {'username': 'thr', 'password': 'wrong'}).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [401, 401, 401, 401, 401]
    assert statuses[5] == 429


@pytest.mark.django_db
def test_logout_blacklists_refresh_token():
    User.objects.create_user(username='outuser', email='ou@test.com', password='pwd', role='seller')
    client = APIClient()
    login = client.post('/api/v1/token/', {'username': 'outuser', 'password': 'pwd'})
    assert login.status_code == 200
    refresh = login.data['refresh']

    logout = client.post('/api/v1/token/logout/', {'refresh': refresh})
    assert logout.status_code in (200, 204, 205)

    reused = client.post('/api/v1/token/refresh/', {'refresh': refresh})
    assert reused.status_code in (400, 401)

    assert AuditLog.objects.filter(action='LOGOUT', entity_type='user').exists()


@pytest.mark.django_db
def test_refresh_rotates_and_rejects_old_token():
    User.objects.create_user(username='rotuser', email='rot@test.com', password='pwd', role='seller')
    client = APIClient()
    login = client.post('/api/v1/token/', {'username': 'rotuser', 'password': 'pwd'})
    assert login.status_code == 200
    old_refresh = login.data['refresh']

    rotated = client.post('/api/v1/token/refresh/', {'refresh': old_refresh})
    assert rotated.status_code == 200
    assert rotated.data.get('access')
    new_refresh = rotated.data.get('refresh')
    assert new_refresh
    assert new_refresh != old_refresh

    reused = client.post('/api/v1/token/refresh/', {'refresh': old_refresh})
    assert reused.status_code in (400, 401)

    second = client.post('/api/v1/token/refresh/', {'refresh': new_refresh})
    assert second.status_code == 200
    assert second.data.get('access')


@pytest.mark.django_db
def test_create_manager_creates_usable_account(capsys):
    call_command(
        'create_manager',
        username='boss',
        email='boss@example.com',
        password='S3cret!pass',
        first_name='Анна',
        last_name='Босс',
    )
    user = User.objects.get(username='boss')
    assert user.role == 'manager'
    assert user.check_password('S3cret!pass')
    assert user.email == 'boss@example.com'
    out = capsys.readouterr().out
    assert 'создан' in out.lower() or 'created' in out.lower()


@pytest.mark.django_db
def test_create_manager_is_idempotent():
    User.objects.create_user(
        username='boss', email='old@example.com', password='oldpass', role='seller',
    )
    call_command(
        'create_manager',
        username='boss',
        email='new@example.com',
        password='S3cret!pass',
    )
    user = User.objects.get(username='boss')
    assert User.objects.filter(username='boss').count() == 1
    assert user.role == 'seller'
    assert user.check_password('oldpass')


@pytest.mark.django_db
def test_seller_can_change_own_password_via_me():
    seller = User.objects.create_user(
        username='me_pwd', email='mep@test.com', password='oldpass', role='seller',
    )
    api = APIClient()
    login = api.post('/api/v1/token/', {'username': 'me_pwd', 'password': 'oldpass'})
    assert login.status_code == 200
    refresh = login.data['refresh']
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')

    missing = api.patch('/api/v1/users/users/me/', {'password': 'Newpass123'})
    assert missing.status_code == 400

    wrong = api.patch('/api/v1/users/users/me/', {
        'password': 'Newpass123', 'current_password': 'nope',
    })
    assert wrong.status_code == 400
    seller.refresh_from_db()
    assert seller.check_password('oldpass')

    response = api.patch('/api/v1/users/users/me/', {
        'password': 'Newpass123', 'current_password': 'oldpass',
    })
    assert response.status_code == 200, response.data
    seller.refresh_from_db()
    assert seller.check_password('Newpass123')
    assert not seller.check_password('oldpass')

    reused = api.post('/api/v1/token/refresh/', {'refresh': refresh})
    assert reused.status_code in (400, 401)

    still_access = api.get('/api/v1/users/users/me/')
    assert still_access.status_code in (401, 403)


@pytest.mark.django_db
def test_seller_cannot_change_role_via_me():
    seller = User.objects.create_user(
        username='me_role', email='mer@test.com', password='pwd', role='seller',
    )
    api = APIClient()
    api.force_authenticate(user=seller)
    response = api.patch('/api/v1/users/users/me/', {'role': 'manager'})
    assert response.status_code == 400
    seller.refresh_from_db()
    assert seller.role == 'seller'


@pytest.mark.django_db
def test_manager_cannot_deactivate_self():
    manager = User.objects.create_user(
        username='mgr_self', email='mself@test.com', password='pwd', role='manager',
    )
    api = APIClient()
    api.force_authenticate(user=manager)
    response = api.patch(f'/api/v1/users/users/{manager.pk}/', {'is_active': False})
    assert response.status_code == 400
    manager.refresh_from_db()
    assert manager.is_active is True


@pytest.mark.django_db
def test_deactivated_user_access_token_is_rejected():
    manager = User.objects.create_user(
        username='mgr_off', email='moff@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='sel_off', email='soff@test.com', password='pwd', role='seller',
    )
    api = APIClient()
    login = api.post('/api/v1/token/', {'username': 'sel_off', 'password': 'pwd'})
    assert login.status_code == 200
    api.force_authenticate(user=manager)
    off = api.patch(f'/api/v1/users/users/{seller.pk}/', {'is_active': False})
    assert off.status_code == 200, off.data
    api.force_authenticate(user=None)
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
    denied = api.get('/api/v1/users/users/me/')
    assert denied.status_code in (401, 403)


@pytest.mark.django_db
def test_manager_can_deactivate_other_user():
    manager = User.objects.create_user(
        username='mgr_act', email='mact@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='sel_act', email='sact@test.com', password='pwd', role='seller',
    )
    api = APIClient()
    api.force_authenticate(user=manager)
    response = api.patch(f'/api/v1/users/users/{seller.pk}/', {'is_active': False})
    assert response.status_code == 200, response.data
    seller.refresh_from_db()
    assert seller.is_active is False


@pytest.mark.django_db
def test_login_throttle_is_per_forwarded_client_ip(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, 'NUM_PROXIES': 2}
    User.objects.create_user(username='thr_a', email='tha@test.com', password='pwd', role='seller')
    User.objects.create_user(username='thr_b', email='thb@test.com', password='pwd', role='seller')
    api = APIClient()
    for _ in range(5):
        response = api.post(
            '/api/v1/token/',
            {'username': 'thr_a', 'password': 'wrong'},
            HTTP_X_FORWARDED_FOR='10.0.0.1, 172.18.0.10',
        )
        assert response.status_code == 401, response.data
    blocked = api.post(
        '/api/v1/token/',
        {'username': 'thr_a', 'password': 'wrong'},
        HTTP_X_FORWARDED_FOR='10.0.0.1, 172.18.0.10',
    )
    assert blocked.status_code == 429
    other_ip = api.post(
        '/api/v1/token/',
        {'username': 'thr_b', 'password': 'wrong'},
        HTTP_X_FORWARDED_FOR='10.0.0.2, 172.18.0.10',
    )
    assert other_ip.status_code == 401, other_ip.data
