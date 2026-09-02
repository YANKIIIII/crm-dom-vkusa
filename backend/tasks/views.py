from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from common.audit import write_audit
from common.permissions import HasModule
from tasks.models import Board, Card
from tasks.serializers import (
    BoardDetailSerializer,
    BoardListSerializer,
    CardNestedSerializer,
    CardWriteSerializer,
)
from tasks.services import ensure_board, user_can_access_board


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


class CardViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [HasModule('tasks')]
    http_method_names = ['post', 'patch', 'delete', 'head', 'options']
    queryset = Card.objects.select_related('list__board', 'order', 'client')

    def get_serializer_class(self):
        return CardWriteSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'CREATE', 'task_card', instance.pk)

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'UPDATE', 'task_card', instance.pk)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not user_can_access_board(request.user, instance.list.board):
            raise PermissionDenied
        pk = instance.pk
        instance.delete()
        write_audit(request.user, 'DELETE', 'task_card', pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_board(self.request.user, obj.list.board):
            raise PermissionDenied
        return obj

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        body = CardNestedSerializer(serializer.instance).data
        return Response(body, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(CardNestedSerializer(serializer.instance).data)
