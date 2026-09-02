import django_filters
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from .models import AuditLog
from .permissions import HasModule
from .serializers import AuditLogSerializer

RESTRICTED_DELETE_MESSAGE = 'Нельзя удалить: запись используется в заказах или товарах.'


class RestrictedDeleteMixin:
    def perform_destroy(self, instance):
        try:
            instance.delete()
        except (ProtectedError, RestrictedError) as exc:
            raise ValidationError(RESTRICTED_DELETE_MESSAGE) from exc


class AuditLogFilter(django_filters.FilterSet):
    date_after = django_filters.DateFilter(field_name='timestamp', lookup_expr='date__gte')
    date_before = django_filters.DateFilter(field_name='timestamp', lookup_expr='date__lte')

    class Meta:
        model = AuditLog
        fields = ['action', 'entity_type', 'user']


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [HasModule('audit')]
    filterset_class = AuditLogFilter
    ordering_fields = ['timestamp', 'action', 'entity_type', 'entity_id']
    ordering = ['-timestamp']

