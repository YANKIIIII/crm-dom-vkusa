import pytest
from rest_framework.test import APIClient
from users.access import ALL_MODULES, append_tasks_module
from users.models import User

ANALYTICS_URL = '/api/v1/analytics/sales/'
ORDERS_URL = '/api/v1/orders/orders/'
CLIENTS_URL = '/api/v1/clients/clients/'
STOCK_URL = '/api/v1/warehouse/stock_items/'
USERS_URL = '/api/v1/users/users/'
CHANNELS_URL = '/api/v1/orders/sales_channels/'
ME_URL = '/api/v1/users/users/me/'


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_me_returns_job_title_and_default_seller_modules():
    seller = User.objects.create_user(
        username='acc_sel', email='accsel@test.com', password='pwd', role='seller',
    )
    response = _api(seller).get(ME_URL)
    assert response.status_code == 200, response.data
    assert response.data['job_title'] == ''
    assert set(response.data['modules']) == {'orders', 'clients', 'tasks', 'warehouse'}


@pytest.mark.django_db
def test_me_manager_has_all_modules():
    manager = User.objects.create_user(
        username='acc_mgr', email='accmgr@test.com', password='pwd', role='manager',
    )
    response = _api(manager).get(ME_URL)
    assert response.status_code == 200, response.data
    assert set(response.data['modules']) >= {
        'analytics', 'orders', 'clients', 'tasks', 'warehouse', 'references', 'users', 'audit',
    }


@pytest.mark.django_db
def test_manager_can_set_job_title_and_section_access():
    manager = User.objects.create_user(
        username='acc_boss', email='accboss@test.com', password='pwd', role='manager',
    )
    marketer = User.objects.create_user(
        username='acc_mkt', email='accmkt@test.com', password='pwd', role='seller',
    )
    api = _api(manager)
    patched = api.patch(f'{USERS_URL}{marketer.pk}/', {
        'job_title': 'Маркетолог',
        'modules': ['analytics', 'orders', 'clients'],
    }, format='json')
    assert patched.status_code == 200, patched.data
    assert patched.data['job_title'] == 'Маркетолог'
    assert set(patched.data['modules']) == {'analytics', 'orders', 'clients'}

    marketer.refresh_from_db()
    as_marketer = _api(marketer)
    assert as_marketer.get(ANALYTICS_URL).status_code == 200
    assert as_marketer.get(ORDERS_URL).status_code == 200
    assert as_marketer.get(CLIENTS_URL).status_code == 200
    assert as_marketer.get(STOCK_URL).status_code == 403
    assert as_marketer.get(USERS_URL).status_code == 403
    assert as_marketer.post(CHANNELS_URL, {'name': 'Реклама'}).status_code == 403


@pytest.mark.django_db
def test_seller_with_references_can_create_sales_channel():
    manager = User.objects.create_user(
        username='acc_boss2', email='accboss2@test.com', password='pwd', role='manager',
    )
    staff = User.objects.create_user(
        username='acc_ref', email='accref@test.com', password='pwd', role='seller',
        modules=['references', 'orders'],
    )
    created = _api(staff).post(CHANNELS_URL, {'name': 'Офлайн-реклама'})
    assert created.status_code == 201, created.data
    listed = _api(manager).get(CHANNELS_URL)
    assert listed.status_code == 200


@pytest.mark.django_db
def test_seller_cannot_change_modules_or_job_title_via_me():
    seller = User.objects.create_user(
        username='acc_me', email='accme@test.com', password='pwd', role='seller',
    )
    response = _api(seller).patch(ME_URL, {
        'job_title': 'Директор',
        'modules': ['analytics', 'users'],
    }, format='json')
    assert response.status_code == 400
    seller.refresh_from_db()
    assert seller.job_title == ''
    assert seller.modules == []


@pytest.mark.django_db
def test_seller_cannot_receive_users_module():
    manager = User.objects.create_user(
        username='acc_boss3', email='accboss3@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='acc_esc', email='accesc@test.com', password='pwd', role='seller',
    )
    patched = _api(manager).patch(f'{USERS_URL}{seller.pk}/', {
        'modules': ['users', 'analytics'],
    }, format='json')
    assert patched.status_code == 200, patched.data
    assert 'users' not in patched.data['modules']
    assert 'analytics' in patched.data['modules']
    seller.refresh_from_db()
    assert _api(seller).get(USERS_URL).status_code == 403


@pytest.mark.django_db
def test_unknown_module_rejected():
    manager = User.objects.create_user(
        username='acc_boss4', email='accboss4@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='acc_bad', email='accbad@test.com', password='pwd', role='seller',
    )
    response = _api(manager).patch(f'{USERS_URL}{seller.pk}/', {
        'modules': ['root'],
    }, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_demoting_manager_resets_to_seller_default_modules():
    admin = User.objects.create_user(
        username='acc_admin', email='accadmin@test.com', password='pwd', role='manager',
    )
    peer = User.objects.create_user(
        username='acc_peer', email='accpeer@test.com', password='pwd',
        role='manager', modules=list(ALL_MODULES),
    )
    api = _api(admin)
    patched = api.patch(f'{USERS_URL}{peer.pk}/', {'role': 'seller'}, format='json')
    assert patched.status_code == 200, patched.data
    assert patched.data['role'] == 'seller'
    assert set(patched.data['modules']) == {'orders', 'clients', 'tasks', 'warehouse'}
    peer.refresh_from_db()
    assert peer.role == 'seller'
    assert _api(peer).get(ANALYTICS_URL).status_code == 403
    assert _api(peer).get(USERS_URL).status_code == 403
    assert _api(peer).get(ORDERS_URL).status_code == 200


def test_append_tasks_module_skips_empty_stored():
    assert append_tasks_module([]) == []
    assert append_tasks_module(None) == []


def test_append_tasks_module_adds_once():
    assert append_tasks_module(['orders', 'clients']) == ['orders', 'clients', 'tasks']
    assert append_tasks_module(['orders', 'tasks']) == ['orders', 'tasks']
