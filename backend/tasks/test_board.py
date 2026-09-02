import pytest
from users.models import User
from tasks.models import Board, List
from tasks.services import ensure_board


@pytest.mark.django_db
def test_create_user_gets_board_and_three_lists():
    user = User.objects.create_user(
        username='tb_u1', email='tb_u1@test.com', password='pwd', role='seller',
    )
    board = Board.objects.get(owner=user)
    codes = list(board.lists.order_by('sort_order').values_list('code', flat=True))
    assert codes == ['todo', 'doing', 'done']
    names = list(board.lists.order_by('sort_order').values_list('name', flat=True))
    assert names == ['К работе', 'В работе', 'Готово']


@pytest.mark.django_db
def test_ensure_board_is_idempotent():
    user = User.objects.create_user(
        username='tb_u2', email='tb_u2@test.com', password='pwd', role='seller',
    )
    first = ensure_board(user)
    second = ensure_board(user)
    assert first.pk == second.pk
    assert Board.objects.filter(owner=user).count() == 1
    assert List.objects.filter(board=first).count() == 3
