from rest_framework.permissions import BasePermission, SAFE_METHODS

from users.access import user_has_any_module, user_has_module


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


def HasModule(module):
    class _HasModule(BasePermission):
        def has_permission(self, request, view):
            return bool(
                request.user
                and request.user.is_authenticated
                and user_has_module(request.user, module)
            )
    _HasModule.__name__ = f'HasModule_{module}'
    return _HasModule


def HasModuleOrReadOnly(module):
    class _HasModuleOrReadOnly(BasePermission):
        def has_permission(self, request, view):
            user = request.user
            if not user or not user.is_authenticated:
                return False
            if request.method in SAFE_METHODS:
                return True
            return user_has_module(user, module)
    _HasModuleOrReadOnly.__name__ = f'HasModuleOrReadOnly_{module}'
    return _HasModuleOrReadOnly


def HasAnyModule(*modules):
    class _HasAnyModule(BasePermission):
        def has_permission(self, request, view):
            return bool(
                request.user
                and request.user.is_authenticated
                and user_has_any_module(request.user, modules)
            )
    _HasAnyModule.__name__ = 'HasAnyModule_' + '_'.join(modules)
    return _HasAnyModule


class CatalogCardPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return user_has_any_module(user, ('warehouse', 'orders'))
        return user_has_module(user, 'warehouse')


class ClientAccessPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return user_has_any_module(user, ('clients', 'orders'))
        return user_has_module(user, 'clients')

