from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from common.permissions import HasModule
from tasks.models import Board
from tasks.serializers import BoardDetailSerializer, BoardListSerializer
from tasks.services import ensure_board


def user_can_access_board(user, board):
    if user.role == 'manager':
        return True
    return board.owner_id == user.pk


class BoardViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasModule('tasks')]
    pagination_class = None

    def get_queryset(self):
        qs = Board.objects.select_related('owner').prefetch_related(
            'lists__cards__order',
            'lists__cards__client',
        )
        user = self.request.user
        if self.action == 'retrieve':
            return qs
        if user.role == 'manager':
            return qs.filter(owner__is_active=True).order_by('id')
        ensure_board(user)
        return qs.filter(owner=user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return BoardDetailSerializer
        return BoardListSerializer

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_board(self.request.user, obj):
            raise PermissionDenied
        ensure_board(obj.owner)
        return self.get_queryset().get(pk=obj.pk)
