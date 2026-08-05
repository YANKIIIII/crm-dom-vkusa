from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Client, ClientPhone
from .serializers import ClientSerializer, ClientPhoneSerializer

from rest_framework.exceptions import PermissionDenied

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.select_related('seller').prefetch_related('phones').order_by('-id')
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['purchase_category', 'grill_type']
    search_fields = ['first_name', 'last_name', 'email', 'phones__number']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            qs = qs.filter(seller=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            serializer.save(seller=user)
        else:
            serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            # Нельзя менять продавца
            serializer.save(seller=user)
        else:
            serializer.save()

    def destroy(self, request, *args, **kwargs):
        if hasattr(request.user, 'role') and request.user.role == 'seller':
            raise PermissionDenied("Продавцы не могут удалять клиентов.")
        return super().destroy(request, *args, **kwargs)

class ClientPhoneViewSet(viewsets.ModelViewSet):
    queryset = ClientPhone.objects.select_related('client').order_by('id')
    serializer_class = ClientPhoneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if hasattr(user, 'role') and user.role == 'seller':
            qs = qs.filter(client__seller=user)
        return qs

    def perform_create(self, serializer):
        client = serializer.validated_data.get('client')
        if hasattr(self.request.user, 'role') and self.request.user.role == 'seller':
            if client.seller != self.request.user:
                raise PermissionDenied("Нельзя добавлять телефоны чужим клиентам.")
        serializer.save()

    def perform_update(self, serializer):
        client = serializer.validated_data.get('client')
        if hasattr(self.request.user, 'role') and self.request.user.role == 'seller':
            if client is not None and client.seller != self.request.user:
                raise PermissionDenied("Нельзя переносить телефоны чужим клиентам.")
        serializer.save()
