from django.db import transaction
from tasks.models import Board, Card, List

DEFAULT_LISTS = (
    ('todo', 'К работе', 0),
    ('doing', 'В работе', 1),
    ('done', 'Готово', 2),
)


def user_can_access_board(user, board):
    if getattr(user, 'role', None) == 'manager':
        return True
    return board.owner_id == user.pk


def ensure_board(user):
    board, _created = Board.objects.get_or_create(owner=user)
    for code, name, sort_order in DEFAULT_LISTS:
        List.objects.get_or_create(
            board=board,
            code=code,
            defaults={'name': name, 'sort_order': sort_order},
        )
    return board


def place_card(card, dest_list, dest_position):
    dest_position = max(0, int(dest_position))
    with transaction.atomic():
        source_id = card.list_id
        dest_id = dest_list.pk
        locked = list(
            Card.objects.select_for_update()
            .filter(list_id__in={source_id, dest_id})
            .order_by('list_id', 'position', 'id')
        )
        others_source = [item for item in locked if item.list_id == source_id and item.pk != card.pk]
        others_dest = [item for item in locked if item.list_id == dest_id and item.pk != card.pk]
        if source_id == dest_id:
            sequence = others_source
            dest_position = min(dest_position, len(sequence))
            sequence.insert(dest_position, card)
            for index, item in enumerate(sequence):
                if item.position != index:
                    item.position = index
                    item.save(update_fields=['position', 'updated_at'])
            return card
        dest_position = min(dest_position, len(others_dest))
        others_dest.insert(dest_position, card)
        card.list = dest_list
        card.position = dest_position
        card.save(update_fields=['list', 'position', 'updated_at'])
        for index, item in enumerate(others_source):
            if item.position != index:
                item.position = index
                item.save(update_fields=['position', 'updated_at'])
        for index, item in enumerate(others_dest):
            if item.pk == card.pk:
                if card.position != index:
                    card.position = index
                    card.save(update_fields=['position', 'updated_at'])
                continue
            if item.position != index:
                item.position = index
                item.save(update_fields=['position', 'updated_at'])
        return card
