from datetime import timedelta

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from common.audit import write_audit
from common.permissions import IsManager
from .models import AuthLock, User, UserProfile
from .serializers import UserSerializer, UserProfileSerializer

LOCKOUT_LIMIT = 5
LOCKOUT_MINUTES = 15


def _auth_details(request, username, result):
    return {
        'status': result,
        'username': username,
        'ip_address': request.META.get('REMOTE_ADDR'),
        'user_agent': (request.META.get('HTTP_USER_AGENT') or '')[:400],
    }


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.order_by('id')
    serializer_class = UserSerializer
    permission_classes = [IsManager]
    search_fields = ['username', 'first_name', 'last_name', 'email']
    ordering_fields = ['id', 'username', 'first_name', 'last_name', 'role', 'is_active', 'last_login', 'date_joined']
    ordering = ['id']

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    def perform_create(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'CREATE', 'user', instance.pk)

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit(self.request.user, 'UPDATE', 'user', instance.pk)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            raise ValidationError('Нельзя удалить собственную учётную запись.')
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        pk = instance.pk
        instance.delete()
        write_audit(self.request.user, 'DELETE', 'user', pk)


class TokenObtainPairWithAuditView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        username = (request.data.get('username') or '').strip()
        key = username.lower()
        now = timezone.now()
        lock = AuthLock.objects.filter(username=key).first() if key else None
        if lock and lock.locked_until:
            if lock.locked_until > now:
                return Response(
                    {'detail': 'Слишком много неудачных попыток. Повторите через 15 минут.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            lock.failed_count = 0
            lock.locked_until = None
            lock.save(update_fields=['failed_count', 'locked_until'])

        user = User.objects.filter(username__iexact=username).first() if username else None
        try:
            response = super().post(request, *args, **kwargs)
        except (AuthenticationFailed, ValidationError):
            if key:
                lock, _ = AuthLock.objects.get_or_create(username=key, defaults={'failed_count': 0})
                lock.failed_count += 1
                if lock.failed_count >= LOCKOUT_LIMIT:
                    lock.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
                lock.save(update_fields=['failed_count', 'locked_until'])
            write_audit(
                user,
                'LOGIN',
                'user',
                user.pk if user else 0,
                details=_auth_details(request, username, 'failure'),
            )
            raise

        if response.status_code == 200:
            if lock:
                lock.delete()
            if user:
                write_audit(user, 'LOGIN', 'user', user.pk, details=_auth_details(request, username, 'success'))
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response({'detail': 'Укажите refresh-токен.'}, status=status.HTTP_400_BAD_REQUEST)
        user = None
        try:
            token = RefreshToken(refresh)
            user_id = token.get('user_id')
            if user_id:
                user = User.objects.filter(pk=user_id).first()
            token.blacklist()
        except TokenError:
            return Response({'detail': 'Недействительный токен.'}, status=status.HTTP_400_BAD_REQUEST)
        write_audit(user, 'LOGOUT', 'user', user.pk if user else 0, details={'status': 'success'})
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserProfileViewSet(viewsets.ModelViewSet):
    queryset = UserProfile.objects.select_related('user').order_by('id')
    serializer_class = UserProfileSerializer
    permission_classes = [IsManager]
