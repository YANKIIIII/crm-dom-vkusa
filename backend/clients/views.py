from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
import django_filters
from common.audit import write_audit
from .models import Client, ClientPhone
from .serializers import ClientSerializer, ClientPhoneSerializer


class ClientFilter(django_filters.FilterSet):
    discount_min = django_filters.NumberFilter(field_name='discount_percent', lookup_expr='gte')
    discount_max = django_filters.NumberFilter(field_name='discount_percent', lookup_expr='lte')
    last_purchase_after = django_filters.DateFilter(field_name='last_purchase_date', lookup_expr='gte')
    last_purchase_before = django_filters.DateFilter(field_name='last_purchase_date', lookup_expr='lte')

    class Meta:
        model = Client
        fields = ['purchase_category', 'grill_type']


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.select_related('seller').prefetch_related('phones').order_by('-id')
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = ClientFilter
    search_fields = ['first_name', 'last_name', 'email', 'phones__number']
    ordering_fields = [
        'id', 'first_name', 'last_name', 'email', 'discount_percent',
        'purchase_category', 'last_purchase_date', 'first_purchase_date', 'total_budget',
    ]
    ordering = ['-id']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            qs = qs.filter(seller=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            instance = serializer.save(seller=user)
        else:
            instance = serializer.save()
        write_audit(user, 'CREATE', 'client', instance.pk)

    def perform_update(self, serializer):
        old_discount = serializer.instance.discount_percent
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            instance = serializer.save(seller=user)
        else:
            instance = serializer.save()
        write_audit(user, 'UPDATE', 'client', instance.pk)
        if instance.discount_percent != old_discount:
            from clients.services import ClientService
            ClientService.recalculate_budget(instance)

    def perform_destroy(self, instance):
        pk = instance.pk
        instance.delete()
        write_audit(self.request.user, 'DELETE', 'client', pk)

    def destroy(self, request, *args, **kwargs):
        if hasattr(request.user, 'role') and request.user.role == 'seller':
            raise PermissionDenied("Продавцы не могут удалять клиентов.")
        return super().destroy(request, *args, **kwargs)

class ClientPhoneViewSet(viewsets.ModelViewSet):
    queryset = ClientPhone.objects.select_related('client').order_by('id')
    serializer_class = ClientPhoneSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['client']

    def get_queryset(self):
        return super().get_queryset()

    def _sync_primary(self, instance):
        if not instance.is_primary:
            return
        ClientPhone.objects.filter(
            client_id=instance.client_id,
            is_primary=True,
        ).exclude(pk=instance.pk).update(is_primary=False)

    def perform_create(self, serializer):
        instance = serializer.save()
        self._sync_primary(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._sync_primary(instance)
