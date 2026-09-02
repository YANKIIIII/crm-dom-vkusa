# Персонал — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вкладка руководителя `/personnel`: карточка сотрудника (телефон, др, заметка, ставка, %), ЗП за месяц (часы × ставка + % с завершённых заказов + бонус) и календарь отпусков/отгулов команды.

**Architecture:** Приложение `personnel` (MonthEntry, Leave) + поля на `users.UserProfile`. Модуль `personnel` только у руководителя. Продажи считаются на лету по `completed_at` в `Europe/Minsk`. Spec: `docs/superpowers/specs/2026-09-02-personnel-design.md`.

**Tech Stack:** Django 6.1 + DRF + pytest; React 19 + MUI 9 + Vite.

**Где работать:** worktree `.worktrees/personnel`, ветка `feat/personnel`. **Не** `.worktrees/post-audit-quality`. **Не** `master` до мержа. **Не** `docker-compose.prod.yml` на ноутбуке.

**Тесты:** из каталога `backend/` worktree через venv репозитория:

```text
c:\Users\syoma\.gemini\antigravity-ide\scratch\crm-dom-vkusa\.venv\Scripts\python.exe -m pytest <args> -v
```

Рабочая директория: `c:\Users\syoma\.gemini\antigravity-ide\scratch\crm-dom-vkusa\.worktrees\personnel\backend`

В CI: `python -m pytest` из `backend/`.

**Не делать:** сотрудник видит ЗП; заморозка месяца; больничный; табель по дням; Excel; создание учёток из Персонала; деплой без просьбы.

---

## Success criteria

1. `create_user` создаёт `UserProfile` с `commission_percent=3.00`, `hourly_rate=0`.
2. ЗП = `hours * hourly_rate + commission_percent/100 * sales_total + bonus`, 2 знака.
3. В продажи входят только заказы со статусом `kind=completed`, `seller_id` сотрудника и `completed_at` в выбранном месяце Минска. Чужой продавец, отмена, открытый, пустой `completed_at` — нет.
4. Нет `MonthEntry` → часы/бонус 0, ставка/% из профиля. Сохранённый месяц не меняется после PATCH профиля.
5. Сотрудник: 403 на все `/api/v1/personnel/`. Руководитель: 200. `personnel` нет в `GRANTABLE_MODULES` и чекбоксах Users.
6. Отпуск 25.08–05.09 попадает в `GET leaves?year=2026&month=8` и `month=9`. `date_to < date_from` → 400.
7. Меню «Персонал» между Справочники и Пользователи, только руководитель. Вкладки «Сотрудники» и «Отпуска / отгулы».
8. `python -m pytest -q` зелёный; `npm run lint` и `npm run build` в `frontend/` зелёные.

---

## File map

| Area | Create | Modify |
|------|--------|--------|
| App | `backend/personnel/__init__.py`, `apps.py`, `models.py`, `services.py`, `signals.py`, `serializers.py`, `views.py`, `urls.py`, `migrations/0001_initial.py` | `backend/config/settings.py`, `backend/config/urls.py` |
| Profile | — | `backend/users/models.py`, `backend/users/migrations/0005_profile_payroll_fields.py` |
| Модуль | — | `backend/users/access.py`, `backend/users/test_access.py` |
| Тесты | `backend/personnel/test_pay.py`, `backend/personnel/test_api_employees.py`, `backend/personnel/test_api_leaves.py` | — |
| FE | `frontend/src/pages/Personnel.jsx`, `frontend/src/pages/personnel/EmployeesPanel.jsx`, `frontend/src/pages/personnel/LeaveCalendar.jsx`, `frontend/src/pages/personnel/LeaveDialog.jsx` | `frontend/src/App.jsx`, `frontend/src/components/Layout/Sidebar.jsx`, `frontend/src/utils.js`, `frontend/src/pages/AuditLog.jsx` |

`Users.jsx` не трогать: `personnel` не добавлять в `GRANTABLE_MODULES`.

---

## Dependency graph

```text
Task 1  models + profile + ensure_profile + pay/leave services + module personnel
  → Task 2 employees/month API          ─┐
  → Task 3 leaves API                   ─┤ параллельно после Task 1
  → Task 4 FE shell + EmployeesPanel    ─┘ после Task 2 (контракт списка/карточки)
  → Task 5 LeaveCalendar + LeaveDialog     после Task 3 и каркаса Task 4
```

Владение файлами после Task 1: Task 2 правит `views.py` / `serializers.py` / `urls.py` **только секции employees**; Task 3 — **только leaves**. Если оба агента живы сразу — Task 3 не трогает `views.py`: вынести leaves в `leave_views.py` (см. Task 3). Task 4 не правит календарь. Task 5 не правит EmployeesPanel.

---

### Task 1: Модели, профиль, сервисы, модуль

**Files:**
- Create: `backend/personnel/__init__.py` (пусто)
- Create: `backend/personnel/apps.py`
- Create: `backend/personnel/models.py` — только `MonthEntry`, `Leave`
- Create: `backend/personnel/services.py`
- Create: `backend/personnel/signals.py`
- Create: `backend/personnel/test_pay.py`
- Create: `backend/personnel/urls.py` — пока `urlpatterns = []`
- Modify: `backend/users/models.py` — поля профиля
- Modify: `backend/users/access.py` — `'personnel'` в `ALL_MODULES` после `'warehouse'` или перед `'references'` (логичный порядок: … warehouse, references, personnel, users, audit). **Не** в GRANTABLE / SELLER_DEFAULT.
- Modify: `backend/users/test_access.py` — manager `me` содержит `personnel`
- Modify: `backend/config/settings.py` — `'personnel.apps.PersonnelConfig'`
- Migrations: `users/0005_profile_payroll_fields.py`, `personnel/0001_initial.py`

- [ ] **Step 1: Падающие тесты** в `backend/personnel/test_pay.py`

```python
from datetime import date, datetime
from decimal import Decimal

import pytest
from django.utils import timezone
from zoneinfo import ZoneInfo

from catalog.models import ProductCard, ProductCategory, Supplier
from orders.models import Order, OrderItem, SalesChannel
from personnel.models import Leave, MonthEntry
from personnel.services import (
    compute_pay,
    ensure_profile,
    leaves_intersecting_month,
    month_bounds,
    sales_total_for,
)
from users.models import User, UserProfile

MINSK = ZoneInfo('Europe/Minsk')


def _seller(**kwargs):
    defaults = dict(
        username='pay_sel', email='paysel@test.com', password='pwd', role='seller',
    )
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


def _completed_order(seller, completed_at, price=Decimal('200'), qty=1, **kwargs):
    channel, _ = SalesChannel.objects.get_or_create(name='Pay Channel')
    category, _ = ProductCategory.objects.get_or_create(name='Pay Cat', defaults={'code': 'P'})
    supplier, _ = Supplier.objects.get_or_create(name='Pay Sup')
    product = ProductCard.objects.create(
        name='Pay Grill', sku=f'PAY-{seller.pk}-{completed_at}',
        category=category, supplier=supplier, base_cost_price=100,
    )
    order = Order.objects.create(
        order_date=completed_at.date(),
        status=Order.Status.COMPLETED,
        seller=seller,
        sales_channel=channel,
        created_by=seller,
        completed_at=completed_at,
        **kwargs,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=qty,
        cost_price=Decimal('100'), price=price, vat_rate=Decimal('20'),
    )
    return order


@pytest.mark.django_db
def test_create_user_makes_profile_with_default_commission():
    user = _seller()
    profile = UserProfile.objects.get(user=user)
    assert profile.commission_percent == Decimal('3.00')
    assert profile.hourly_rate == Decimal('0.00')
    assert profile.phone == ''
    assert profile.birthday is None
    assert profile.notes == ''


@pytest.mark.django_db
def test_compute_pay_hours_percent_bonus():
    total = compute_pay(
        hours=Decimal('168'),
        hourly_rate=Decimal('500'),
        commission_percent=Decimal('3'),
        sales_total=Decimal('1000000'),
        bonus=Decimal('5000'),
    )
    assert total == Decimal('119000.00')


@pytest.mark.django_db
def test_sales_only_completed_in_minsk_month():
    seller = _seller()
    other = _seller(username='pay_oth', email='payoth@test.com')
    sept = datetime(2026, 9, 10, 12, 0, tzinfo=MINSK)
    aug = datetime(2026, 8, 31, 23, 0, tzinfo=MINSK)
    _completed_order(seller, sept)  # 200 * 1.2 = 240
    _completed_order(seller, aug)
    cancelled = _completed_order(seller, sept, price=Decimal('500'))
    cancelled.status = Order.Status.CANCELLED
    cancelled.save(update_fields=['status'])
    open_order = _completed_order(seller, sept, price=Decimal('300'))
    open_order.status = Order.Status.RESERVED
    open_order.completed_at = None
    open_order.save(update_fields=['status', 'completed_at'])
    _completed_order(other, sept)
    assert sales_total_for(seller, 2026, 9) == Decimal('240.00')


@pytest.mark.django_db
def test_without_month_entry_hours_zero_rate_from_profile():
    seller = _seller()
    profile = ensure_profile(seller)
    profile.hourly_rate = Decimal('500')
    profile.commission_percent = Decimal('3')
    profile.save()
    sept = datetime(2026, 9, 10, 12, 0, tzinfo=MINSK)
    _completed_order(seller, sept)
    assert MonthEntry.objects.filter(user=seller, year=2026, month=9).exists() is False
    sales = sales_total_for(seller, 2026, 9)
    pay = compute_pay(
        hours=Decimal('0'),
        hourly_rate=profile.hourly_rate,
        commission_percent=profile.commission_percent,
        sales_total=sales,
        bonus=Decimal('0'),
    )
    assert pay == Decimal('7.20')  # 3% of 240


@pytest.mark.django_db
def test_saved_month_ignores_later_profile_rate_change():
    seller = _seller()
    profile = ensure_profile(seller)
    profile.hourly_rate = Decimal('500')
    profile.commission_percent = Decimal('3')
    profile.save()
    MonthEntry.objects.create(
        user=seller, year=2026, month=9,
        hours=Decimal('10'), bonus=Decimal('0'),
        hourly_rate=Decimal('500'), commission_percent=Decimal('3'),
    )
    profile.hourly_rate = Decimal('999')
    profile.save(update_fields=['hourly_rate'])
    row = MonthEntry.objects.get(user=seller, year=2026, month=9)
    assert row.hourly_rate == Decimal('500')
    pay = compute_pay(
        hours=row.hours, hourly_rate=row.hourly_rate,
        commission_percent=row.commission_percent,
        sales_total=Decimal('0'), bonus=row.bonus,
    )
    assert pay == Decimal('5000.00')


@pytest.mark.django_db
def test_leave_spans_month_boundary():
    seller = _seller()
    Leave.objects.create(
        user=seller, kind=Leave.Kind.VACATION,
        date_from=date(2026, 8, 25), date_to=date(2026, 9, 5),
    )
    aug = leaves_intersecting_month(2026, 8)
    sept = leaves_intersecting_month(2026, 9)
    assert aug.filter(user=seller).exists()
    assert sept.filter(user=seller).exists()
    assert not leaves_intersecting_month(2026, 7).filter(user=seller).exists()


@pytest.mark.django_db
def test_month_bounds_are_minsk():
    start, end = month_bounds(2026, 9)
    assert start.tzinfo is not None
    assert start == datetime(2026, 9, 1, 0, 0, tzinfo=MINSK)
    assert end == datetime(2026, 10, 1, 0, 0, tzinfo=MINSK)
```

- [ ] **Step 2: Прогнать тесты — должны упасть** (нет модуля `personnel` / нет полей)

```text
c:\Users\syoma\.gemini\antigravity-ide\scratch\crm-dom-vkusa\.venv\Scripts\python.exe -m pytest personnel/test_pay.py -v
```

- [ ] **Step 3: Реализация**

`UserProfile` добавить поля (validators `MinValueValidator(0)`, у процента ещё `MaxValueValidator(100)`):

```python
birthday = models.DateField(null=True, blank=True, verbose_name='День рождения')
notes = models.TextField(blank=True, verbose_name='Заметка')
hourly_rate = models.DecimalField(
    max_digits=12, decimal_places=2, default=Decimal('0.00'),
    validators=[MinValueValidator(Decimal('0.00'))],
    verbose_name='Ставка часа',
)
commission_percent = models.DecimalField(
    max_digits=5, decimal_places=2, default=Decimal('3.00'),
    validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
    verbose_name='Процент с продаж',
)
```

`personnel/apps.py`:

```python
from django.apps import AppConfig

class PersonnelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'personnel'

    def ready(self):
        import personnel.signals  # noqa: F401
```

`MonthEntry` / `Leave` как в spec. `Leave.Kind`: `vacation`, `time_off`. UniqueConstraint `(user, year, month)`. `created_by` SET_NULL.

`services.py`:

- `ensure_profile(user)` → `UserProfile.objects.get_or_create(user=user, defaults={...})`
- `month_bounds(year, month)` → `[start, end)` в `Europe/Minsk`
- `compute_pay(...)` → `(hours * rate + percent/100 * sales + bonus).quantize(Decimal('0.01'))`
- `sales_total_for(user, year, month)` — заказы `status__in=completed_order_status_codes()`, `seller=user`, `completed_at >= start`, `completed_at < end`; сумма `total_amount` (через позиции как analytics `LINE_REVENUE` **или** сумма по заказам в Python; результат должен совпасть с `Order.total_amount`). Предпочтительно annotate/Sum как в `analytics/views.py` (`LINE_REVENUE`), сгруппировать не обязательно для одного user.
- `effective_month(user, year, month)` → dict hours/bonus/rates/`rate_source`
- `leaves_intersecting_month(year, month)` → queryset `date_from <= last` AND `date_to >= first`

Сигнал `post_save` User `created=True` → `ensure_profile`.

`ALL_MODULES` добавить `'personnel'` (рядом с `users`/`audit`). Тест `test_me_manager_has_all_modules` — добавить `'personnel'` в ожидаемый набор.

INSTALLED_APPS: `'personnel.apps.PersonnelConfig'`.

```text
python manage.py makemigrations users --name profile_payroll_fields
python manage.py makemigrations personnel
```

- [ ] **Step 4: Тесты зелёные**

```text
python -m pytest personnel/test_pay.py users/test_access.py::test_me_manager_has_all_modules -v
```

- [ ] **Step 5: Commit**

```text
git add backend/personnel backend/users/models.py backend/users/access.py backend/users/test_access.py backend/users/migrations/0005_profile_payroll_fields.py backend/config/settings.py
git commit -m "feat(personnel): add payroll models, profile fields, and pay services"
```

---

### Task 2: API сотрудников и месяца

**Files:**
- Create: `backend/personnel/serializers.py`
- Create: `backend/personnel/views.py`
- Modify: `backend/personnel/urls.py`
- Modify: `backend/config/urls.py` — `path('api/v1/personnel/', include('personnel.urls'))`
- Create: `backend/personnel/test_api_employees.py`

Не регистрировать DRF router на users. Не отдавать пароль.

- [ ] **Step 1: Падающие тесты**

```python
from datetime import datetime
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from zoneinfo import ZoneInfo

from catalog.models import ProductCard, ProductCategory, Supplier
from common.models import AuditLog
from orders.models import Order, OrderItem, SalesChannel
from personnel.models import MonthEntry
from personnel.services import ensure_profile
from users.models import User

MINSK = ZoneInfo('Europe/Minsk')
LIST_URL = '/api/v1/personnel/employees/'


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _mgr():
    return User.objects.create_user(
        username='pe_mgr', email='pemgr@test.com', password='pwd', role='manager',
    )


def _sel(**kwargs):
    defaults = dict(username='pe_sel', email='pesel@test.com', password='pwd', role='seller')
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


@pytest.mark.django_db
def test_seller_forbidden_on_employees():
    seller = _sel()
    assert _api(seller).get(LIST_URL).status_code == 403


@pytest.mark.django_db
def test_manager_list_includes_pay_and_inactive():
    manager = _mgr()
    seller = _sel(first_name='Валентин', last_name='Иванов')
    gone = _sel(username='pe_gone', email='gone@test.com', is_active=False)
    ensure_profile(seller)
    profile = seller.profile
    profile.hourly_rate = Decimal('500')
    profile.save(update_fields=['hourly_rate'])
    channel, _ = SalesChannel.objects.get_or_create(name='PE Ch')
    category, _ = ProductCategory.objects.get_or_create(name='PE Cat', defaults={'code': 'E'})
    supplier, _ = Supplier.objects.get_or_create(name='PE Sup')
    product = ProductCard.objects.create(
        name='PE G', sku='PE-1', category=category, supplier=supplier, base_cost_price=100,
    )
    when = datetime(2026, 9, 10, 12, 0, tzinfo=MINSK)
    order = Order.objects.create(
        order_date=when.date(), status=Order.Status.COMPLETED, seller=seller,
        sales_channel=channel, created_by=seller, completed_at=when,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1,
        cost_price=Decimal('100'), price=Decimal('200'), vat_rate=Decimal('20'),
    )
    res = _api(manager).get(LIST_URL, {'year': 2026, 'month': 9})
    assert res.status_code == 200, res.data
    assert isinstance(res.data, list)
    ids = [row['id'] for row in res.data]
    assert seller.pk in ids and gone.pk in ids
    row = next(r for r in res.data if r['id'] == seller.pk)
    assert row['rate_source'] == 'profile'
    assert Decimal(str(row['sales_total'])) == Decimal('240.00')
    assert Decimal(str(row['hours'])) == Decimal('0')
    assert Decimal(str(row['pay_total'])) == Decimal('7.20')


@pytest.mark.django_db
def test_put_month_then_profile_change_does_not_move_month_rate():
    manager = _mgr()
    seller = _sel(username='pe_s2', email='pes2@test.com')
    ensure_profile(seller)
    seller.profile.hourly_rate = Decimal('500')
    seller.profile.commission_percent = Decimal('3')
    seller.profile.save()
    put = _api(manager).put(
        f'{LIST_URL}{seller.pk}/months/2026-09/',
        {'hours': '10', 'bonus': '0'},
        format='json',
    )
    assert put.status_code == 200, put.data
    assert put.data['rate_source'] == 'month'
    assert Decimal(str(put.data['hourly_rate'])) == Decimal('500')
    patch = _api(manager).patch(
        f'{LIST_URL}{seller.pk}/',
        {'hourly_rate': '999'},
        format='json',
    )
    assert patch.status_code == 200, patch.data
    assert Decimal(str(patch.data['hourly_rate'])) == Decimal('999')
    detail = _api(manager).get(f'{LIST_URL}{seller.pk}/', {'year': 2026, 'month': 9})
    assert Decimal(str(detail.data['month']['hourly_rate'])) == Decimal('500')
    assert MonthEntry.objects.get(user=seller, year=2026, month=9).hourly_rate == Decimal('500')
    assert AuditLog.objects.filter(entity_type='personnel_month').exists()
    assert AuditLog.objects.filter(entity_type='personnel_profile').exists()


@pytest.mark.django_db
def test_negative_hours_400_and_bad_month_400():
    manager = _mgr()
    seller = _sel(username='pe_s3', email='pes3@test.com')
    bad = _api(manager).put(
        f'{LIST_URL}{seller.pk}/months/2026-09/',
        {'hours': '-1', 'bonus': '0'},
        format='json',
    )
    assert bad.status_code == 400
    assert _api(manager).get(LIST_URL, {'year': 2026, 'month': 13}).status_code == 400
```

- [ ] **Step 2: Убедиться, что падают**

```text
python -m pytest personnel/test_api_employees.py -v
```

- [ ] **Step 3: Views**

`HasModule('personnel')` на всех.

`parse_year_month(request)` — query `year`/`month`, иначе текущие в Минске; 400 если не int / month не 1–12 / year < 2000.

`GET employees/` — все User, `order_by('-is_active', 'last_name', 'first_name', 'id')`. Без пагинации.

`GET/PATCH employees/<id>/` — PATCH только `phone, birthday, notes, hourly_rate, commission_percent`. `write_audit` UPDATE `personnel_profile`.

`PUT employees/<id>/months/<year>-<month>/` — regex `^(?P<year>[0-9]{4})-(?P<month>0?[1-9]|1[0-2])$`. upsert MonthEntry. Если create и ставки не в теле — из профиля. Если update и ставки не в теле — не трогать. Audit `personnel_month`.

Ответ PUT: эффективный месяц + sales_total + pay_total.

Невалидный URL месяца — 404 от роутера или 400; в тестах month=13 через query.

- [ ] **Step 4: pytest зелёный** включая `personnel/test_pay.py`

- [ ] **Step 5: Commit** `feat(personnel): add employees and month payroll API`

---

### Task 3: API отпусков

**Files:**
- Create: `backend/personnel/leave_views.py` (чтобы не конфликтовать с Task 2, если идёт параллельно; иначе методы в `views.py`)
- Modify: `backend/personnel/urls.py`, `serializers.py`
- Create: `backend/personnel/test_api_leaves.py`

Если Task 2 ещё не смержил urls — добавить:

```python
path('leaves/', ...),
path('leaves/<int:pk>/', ...),
```

рядом с employees, не удаляя их.

- [ ] **Step 1: Падающие тесты**

```python
from datetime import date

import pytest
from rest_framework.test import APIClient

from common.models import AuditLog
from personnel.models import Leave
from users.models import User

LEAVES = '/api/v1/personnel/leaves/'


def _api(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_seller_cannot_list_leaves():
    seller = User.objects.create_user(
        username='lv_sel', email='lvsel@test.com', password='pwd', role='seller',
    )
    assert _api(seller).get(LEAVES).status_code == 403


@pytest.mark.django_db
def test_leave_spans_and_invalid_range():
    manager = User.objects.create_user(
        username='lv_mgr', email='lvmgr@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='lv_s2', email='lvs2@test.com', password='pwd', role='seller',
    )
    api = _api(manager)
    created = api.post(LEAVES, {
        'user': seller.pk,
        'kind': 'vacation',
        'date_from': '2026-08-25',
        'date_to': '2026-09-05',
        'comment': 'море',
    }, format='json')
    assert created.status_code == 201, created.data
    assert created.data['kind'] == 'vacation'
    assert created.data['user']['id'] == seller.pk
    aug = api.get(LEAVES, {'year': 2026, 'month': 8})
    sept = api.get(LEAVES, {'year': 2026, 'month': 9})
    assert any(x['id'] == created.data['id'] for x in aug.data)
    assert any(x['id'] == created.data['id'] for x in sept.data)
    bad = api.post(LEAVES, {
        'user': seller.pk,
        'kind': 'time_off',
        'date_from': '2026-09-10',
        'date_to': '2026-09-01',
    }, format='json')
    assert bad.status_code == 400
    deleted = api.delete(f'{LEAVES}{created.data["id"]}/')
    assert deleted.status_code == 204
    assert AuditLog.objects.filter(entity_type='personnel_leave', action='DELETE').exists()
```

- [ ] **Step 2–4:** ViewSet или APIView: list/create/patch/delete. PATCH нельзя менять `user`. `created_by` = request.user. Audit CREATE/UPDATE/DELETE.

- [ ] **Step 5: Commit** `feat(personnel): add leave calendar API`

---

### Task 4: Оболочка FE + вкладка «Сотрудники»

**Files:** как в file map. Стиль — существующие страницы CRM (MUI, `#CC5E33`, `useFeedback`, `formatCurrency`, `extractApiError`).

- [ ] Добавить `personnel` в `ALL_MODULES` в `frontend/src/utils.js`. **Не** в `GRANTABLE_MODULES`. `MODULE_HOME`: `['personnel', '/personnel']` перед users.
- [ ] Sidebar: `{ text: 'Персонал', icon: 'badge', path: '/personnel', module: 'personnel' }` между Справочники и Пользователи.
- [ ] `App.jsx`: `path="personnel"` + `RoleRoute module="personnel"`.
- [ ] AuditLog: `personnel_profile`, `personnel_month`, `personnel_leave`.
- [ ] `Personnel.jsx`: месяц (`year`/`month`, по умолчанию текущий), Tabs «Сотрудники» | «Отпуска / отгулы». Вторая вкладка пока заглушка «Календарь в следующем шаге», если Task 5 не готов — **или** сразу рендер `<LeaveCalendar />` если файл есть.
- [ ] `EmployeesPanel.jsx`: GET list, слева люди + ЗП, неактивные `opacity: 0.5`. Справа карточка: PATCH профиля, PUT месяца, формула, список leaves из detail, кнопки открывают `LeaveDialog`.
- [ ] Пустой список: «Сотрудников заводят в разделе Пользователи».

`npm run lint` в `frontend/`.

Commit: `feat(fe): add Personnel employees tab for managers`

---

### Task 5: Календарь отпусков

**Files:** `LeaveCalendar.jsx`, `LeaveDialog.jsx`; подключить во вторую вкладку `Personnel.jsx`.

- Сетка: строки = сотрудники (тот же порядок, что список), колонки = дни месяца.
- Отпуск: фон `#90A4AE` / `#CFD8DC`. Отгул: `#CC5E33` с прозрачностью ~0.35.
- Диапазон обрезать по краям месяца.
- Клик по пустому дню → диалог create (user + date_from=date_to=день).
- Клик по полоске → edit/delete (`confirm` из `useFeedback`).
- GET `/personnel/leaves/?year=&month=`.

`npm run lint` && `npm run build`.

Commit: `feat(fe): add team leave calendar on Personnel`

---

## Параллельность

После **зелёного Task 1** можно одновременно:

- агент Task 2 (`views.py` employees, `test_api_employees.py`)
- агент Task 3 (`leave_views.py`, `test_api_leaves.py`) — **не** переписывать employees views
- агент Task 4 оболочку (Sidebar/App/utils) — API можно мокать запросами; карточка завязана на Task 2

Task 5 после контракта leaves (Task 3) и Tabs в Personnel (Task 4).

---

## Self-review (план vs spec)

| Spec | Task |
|------|------|
| Формула, продажи completed_at Минск | 1, 2 |
| Профиль phone/birthday/notes/rate/% | 1, 2, 4 |
| MonthEntry копия ставки | 1, 2 |
| Leave vacation/time_off, overlap месяцев | 1, 3, 5 |
| Модуль только manager | 1, 2, 3, 4 |
| UI две вкладки, список+карточка, календарь | 4, 5 |
| Аудит трёх entity_type | 2, 3, 4 |
| Вне скоупа | не делать |
