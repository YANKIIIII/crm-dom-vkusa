from tasks.models import Board, List

DEFAULT_LISTS = (
    ('todo', 'К работе', 0),
    ('doing', 'В работе', 1),
    ('done', 'Готово', 2),
)


def ensure_board(user):
    board, _created = Board.objects.get_or_create(owner=user)
    for code, name, sort_order in DEFAULT_LISTS:
        List.objects.get_or_create(
            board=board,
            code=code,
            defaults={'name': name, 'sort_order': sort_order},
        )
    return board
