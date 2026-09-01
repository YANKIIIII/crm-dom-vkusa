import django_filters
from rest_framework import viewsets

from .models import AuditLog
from .permissions import IsManager
from .serializers import AuditLogSerializer


class AuditLogFilter(django_filters.FilterSet):
    date_after = django_filters.DateFilter(field_name='timestamp', lookup_expr='date__gte')
    date_before = django_filters.DateFilter(field_name='timestamp', lookup_expr='date__lte')

    class Meta:
        model = AuditLog
        fields = ['action', 'entity_type', 'user']


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [IsManager]
    filterset_class = AuditLogFilter
    ordering_fields = ['timestamp', 'action', 'entity_type', 'entity_id']
    ordering = ['-timestamp']

