ALL_MODULES = (
    'analytics',
    'orders',
    'clients',
    'tasks',
    'warehouse',
    'references',
    'personnel',
    'users',
    'audit',
)
GRANTABLE_MODULES = (
    'analytics',
    'orders',
    'clients',
    'tasks',
    'warehouse',
    'references',
)
SELLER_DEFAULT_MODULES = ('orders', 'clients', 'tasks', 'warehouse')


def append_tasks_module(stored):
    if not stored:
        return []
    if 'tasks' in stored:
        return list(stored)
    return list(stored) + ['tasks']


def stored_modules_for(role, modules=None):
    if role == 'manager':
        return list(ALL_MODULES)
    if modules is None:
        return list(SELLER_DEFAULT_MODULES)
    grantable = [item for item in modules if item in GRANTABLE_MODULES]
    return grantable


def effective_modules(user):
    if not user or not getattr(user, 'is_authenticated', True):
        return []
    if getattr(user, 'role', None) == 'manager':
        return list(ALL_MODULES)
    stored = getattr(user, 'modules', None) or []
    if not isinstance(stored, list):
        stored = []
    grantable = [item for item in stored if item in GRANTABLE_MODULES]
    return grantable or list(SELLER_DEFAULT_MODULES)


def user_has_module(user, module):
    return module in effective_modules(user)


def user_has_any_module(user, modules):
    owned = set(effective_modules(user))
    return any(item in owned for item in modules)
