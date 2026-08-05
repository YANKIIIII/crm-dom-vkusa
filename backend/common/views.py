from rest_framework import viewsets
from .permissions import IsManager
from .models import AuditLog
from .serializers import AuditLogSerializer

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    # ordering-атрибут без OrderingFilter не работает — сортируем сам queryset
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [IsManager]

