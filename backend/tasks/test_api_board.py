import pytest
from rest_framework.test import APIClient
from users.models import User
from tasks.models import Board
from tasks.services import ensure_board

BOARDS_URL = '/api/v1/tasks/boards/'


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _seller(**kwargs):
    defaults = dict(
        username='ts_sel', email='ts_sel@test.com', password='pwd', role='seller',
        modules=['orders', 'clients', 'tasks', 'warehouse'],
    )
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


@pytest.mark.django_db
def test_seller_lists_only_own_board():
    seller = _seller()
    other = _seller(username='ts_oth', email='ts_oth@test.com')
    response = _api(seller).get(BOARDS_URL)
    assert response.status_code == 200, response.data
    payload = response.data
    rows = payload if isinstance(payload, list) else payload.get('results', payload)
    ids = [row['owner']['id'] for row in rows]
    assert ids == [seller.pk]
    assert other.pk not in ids


@pytest.mark.django_db
def test_seller_cannot_retrieve_other_board():
    seller = _seller()
    other = _seller(username='ts_oth2', email='ts_oth2@test.com')
    other_board = Board.objects.get(owner=other)
    response = _api(seller).get(f'{BOARDS_URL}{other_board.pk}/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_seller_without_tasks_module_forbidden():
    seller = _seller(username='ts_notasks', email='ts_nt@test.com', modules=['orders'])
    response = _api(seller).get(BOARDS_URL)
    assert response.status_code == 403


@pytest.mark.django_db
def test_manager_lists_active_boards_and_retrieves_nested():
    manager = User.objects.create_user(
        username='ts_mgr', email='ts_mgr@test.com', password='pwd', role='manager',
    )
    seller = _seller(username='ts_s3', email='ts_s3@test.com', first_name='Валентин', last_name='Иванов')
    inactive = _seller(username='ts_off', email='ts_off@test.com', is_active=False)
    listed = _api(manager).get(BOARDS_URL)
    assert listed.status_code == 200, listed.data
    rows = listed.data if isinstance(listed.data, list) else listed.data.get('results', [])
    owner_ids = {row['owner']['id'] for row in rows}
    assert seller.pk in owner_ids
    assert manager.pk in owner_ids
    assert inactive.pk not in owner_ids

    board = ensure_board(seller)
    detail = _api(manager).get(f'{BOARDS_URL}{board.pk}/')
    assert detail.status_code == 200, detail.data
    codes = [item['code'] for item in detail.data['lists']]
    assert codes == ['todo', 'doing', 'done']
    assert all('cards' in item for item in detail.data['lists'])


@pytest.mark.django_db
def test_manager_retrieves_inactive_owner_board():
    manager = User.objects.create_user(
        username='ts_mgr2', email='ts_mgr2@test.com', password='pwd', role='manager',
    )
    inactive = _seller(username='ts_off2', email='ts_off2@test.com', is_active=False)
    board = Board.objects.get(owner=inactive)
    response = _api(manager).get(f'{BOARDS_URL}{board.pk}/')
    assert response.status_code == 200, response.data
