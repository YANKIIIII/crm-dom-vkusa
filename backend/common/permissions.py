from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsManagerOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return hasattr(request.user, 'role') and request.user.role == 'manager'

class IsManager(BasePermission):
    """
    Allows access only to manager users.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'manager')

class IsSeller(BasePermission):
    """
    Allows access to seller users (and presumably managers).
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in ['manager', 'seller'])
