import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from common.models import AuditLog
from orders.models import Order, SalesChannel
from users.models import User
from tasks.models import Board, Card, List

CARDS_URL = '/api/v1/tasks/cards/'


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _seller(**kwargs):
    defaults = dict(
        username='tc_sel', email='tc_sel@test.com', password='pwd', role='seller',
        modules=['orders', 'clients', 'tasks', 'warehouse'],
    )
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


def _list(user, code='todo'):
    board = Board.objects.get(owner=user)
    return List.objects.get(board=board, code=code)


@pytest.mark.django_db
def test_seller_creates_card_on_own_list():
    seller = _seller()
    column = _list(seller, 'todo')
    response = _api(seller).post(CARDS_URL, {'list': column.pk, 'title': '  Позвонить  '}, format='json')
    assert response.status_code == 201, response.data
    card = Card.objects.get(pk=response.data['id'])
    assert card.title == 'Позвонить'
    assert card.position == 0
    assert card.created_by_id == seller.pk


@pytest.mark.django_db
def test_seller_cannot_post_to_other_list():
    seller = _seller()
    other = _seller(username='tc_oth', email='tc_oth@test.com')
    column = _list(other, 'todo')
    response = _api(seller).post(CARDS_URL, {'list': column.pk, 'title': 'Чужая'}, format='json')
    assert response.status_code == 403


@pytest.mark.django_db
def test_empty_title_rejected():
    seller = _seller(username='tc_empty', email='tc_empty@test.com')
    column = _list(seller, 'todo')
    response = _api(seller).post(CARDS_URL, {'list': column.pk, 'title': '   '}, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_manager_patches_seller_card_and_moves():
    manager = User.objects.create_user(
        username='tc_mgr', email='tc_mgr@test.com', password='pwd', role='manager',
    )
    seller = _seller(username='tc_s2', email='tc_s2@test.com')
    todo = _list(seller, 'todo')
    doing = _list(seller, 'doing')
    a = Card.objects.create(list=todo, title='A', position=0, created_by=seller)
    b = Card.objects.create(list=todo, title='B', position=1, created_by=seller)
    c = Card.objects.create(list=doing, title='C', position=0, created_by=seller)
    response = _api(manager).patch(
        f'{CARDS_URL}{b.pk}/',
        {'list': doing.pk, 'position': 0},
        format='json',
    )
    assert response.status_code == 200, response.data
    a.refresh_from_db()
    b.refresh_from_db()
    c.refresh_from_db()
    assert b.list_id == doing.pk
    assert list(
        Card.objects.filter(list=doing).order_by('position').values_list('id', 'position')
    ) == [(b.pk, 0), (c.pk, 1)]
    assert list(
        Card.objects.filter(list=todo).order_by('position').values_list('id', 'position')
    ) == [(a.pk, 0)]


@pytest.mark.django_db
def test_cannot_move_card_to_other_board_list():
    seller = _seller(username='tc_mv', email='tc_mv@test.com')
    other = _seller(username='tc_mv2', email='tc_mv2@test.com')
    card = Card.objects.create(list=_list(seller, 'todo'), title='X', position=0)
    response = _api(seller).patch(
        f'{CARDS_URL}{card.pk}/',
        {'list': _list(other, 'todo').pk, 'position': 0},
        format='json',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_delete_order_nulls_card_fk():
    seller = _seller(username='tc_ord', email='tc_ord@test.com', role='manager')
    channel = SalesChannel.objects.create(name='Канал задач')
    order = Order.objects.create(
        order_number=88001,
        order_date=timezone.now().date(),
        status=Order.Status.RESERVED,
        seller=seller,
        sales_channel=channel,
        created_by=seller,
    )
    card = Card.objects.create(
        list=_list(seller, 'todo'), title='По заказу', position=0, order=order,
    )
    order.delete()
    card.refresh_from_db()
    assert card.order_id is None
    assert Card.objects.filter(pk=card.pk).exists()


@pytest.mark.django_db
def test_delete_card_writes_audit():
    seller = _seller(username='tc_aud', email='tc_aud@test.com')
    card = Card.objects.create(list=_list(seller, 'todo'), title='Удалить', position=0)
    pk = card.pk
    response = _api(seller).delete(f'{CARDS_URL}{pk}/')
    assert response.status_code == 204
    log = AuditLog.objects.get(action='DELETE', entity_type='task_card', entity_id=pk)
    assert log.user_id == seller.pk
