# CRM Dom Vkusa — план готовности к ежедневной работе

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть продуктовый цикл продавца (клиент → заказ → позиции → оплата → статус) и менеджерские дыры, чтобы CRM была usable ежедневно, а не только «бэкенд зелёный + каркас UI».

**Architecture:** Сначала минимальные доработки API под контракт FE (автономер, read_only поля, phones/payments filter, идемпотентность статусов), затем переписать карточку заказа и auth-shell на фронте, потом менеджерские экраны и polish. Бэкенд остаётся источником истины; UI не дублирует бизнес-правила, только отображает ошибки через `extractApiError`.

**Tech Stack:** Django 6.1 + DRF + SimpleJWT + Postgres; React (Vite) + MUI 9 + axios; pytest / Playwright smoke; Docker Compose.

**Evidence base (2026-08-09):** 28 pytest green; API smoke 13/13; FE-like `POST /orders/` → 400 missing fields; `POST /clients/` with `phone`+`total_budget=99999` → phone dropped, budget accepted; Bugbot + Web Interface Guidelines audit.

---

## Success criteria (Definition of Done)

### Продавец может end-to-end
1. Залогиниться и сразу увидеть список заказов (не 403 на Dashboard).
2. Создать клиента с телефоном.
3. Создать заказ с автономером, каналом, датой, привязанным клиентом.
4. Добавить позиции с корректной ценой без НДС; изменить qty; удалить позицию.
5. Добавить оплату; провести статусы по стейт-машине; выйти (Logout).

### Менеджер дополнительно
6. Удалить активный заказ (confirm) со возвратом склада.
7. Не видеть возможности seller’у править каталог/склад; сам правит остатки.
8. Аналитика/пользователи/аудит доступны; seller по прямому URL получает redirect/403 UI.

### Регрессия
9. `pytest` зелёный; `python scripts/smoke_api.py` и `smoke_ui.py` зелёные (дополнить сценариями Phase A).

---

## File map (что трогаем)

| Area | Files |
|------|--------|
| Order number + serializers | `backend/orders/models.py`, `backend/orders/serializers.py`, `backend/orders/views.py`, `backend/orders/signals.py` |
| Payments API | `backend/orders/serializers.py`, `backend/orders/views.py`, NEW `backend/orders/test_payments.py` |
| Clients integrity | `backend/clients/serializers.py`, `backend/clients/views.py`, NEW nested phone on create optional |
| Mock stock | `backend/common/management/commands/load_mock_data.py` |
| Auth shell FE | `frontend/src/App.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/components/Layout/Sidebar.jsx`, NEW `frontend/src/components/RoleRoute.jsx` |
| Order UI | `frontend/src/pages/OrderDetail.jsx`, `frontend/src/components/ProductSearchModal.jsx`, NEW modals/helpers as needed |
| Client UI | `frontend/src/pages/ClientDetail.jsx`, `frontend/src/pages/Clients.jsx` |
| Catalog/Warehouse FE | `frontend/src/pages/Catalog.jsx`, `frontend/src/pages/Warehouse.jsx` |
| Smoke | `backend/scripts/smoke_api.py`, `backend/scripts/smoke_ui.py` |

---

## Dependency graph & waves

```text
Wave 0 (BE foundations, parallelizable)
  T0.1 auto order_number
  T0.2 read_only mass-assignment (budget, completed_at, purchase dates)
  T0.3 payments filter + validation
  T0.4 client create+phone (serializer or view)
  T0.5 status side-effects under select_for_update + idempotency
  T0.6 load_mock_data reserves stock

Wave 1 (FE shell) depends on nothing from Wave 0
  T1.1 RoleRoute + seller landing /orders
  T1.2 Logout button

Wave 2 (FE order cycle) depends on T0.1–T0.4
  T2.1 Order create form (date, channel, auto number)
  T2.2 Client picker modal
  T2.3 Fix VAT/price on add items + qty edit/delete
  T2.4 Payments UI
  T2.5 Status transitions UX (allowed only) + confirm cancel
  T2.6 ClientDetail phones + grill_type select

Wave 3 (Manager) depends on Wave 2
  T3.1 Delete order (manager) + confirm
  T3.2 Hide catalog/warehouse write for seller; wire edit stock
  T3.3 Real pagination/search Catalog & Warehouse
  T3.4 Budget adjust on destroy completed (product decision: block delete OR reverse budget)

Wave 4 (Polish)
  T4.1 Guidelines: labels, Intl currency/dates, Link rows, empty/loading states
  T4.2 Mobile drawer temporary
  T4.3 Remove dead code / stubs
  T4.4 Expand smoke_ui for full seller path
```

---

# PHASE A — Ядро продавца (Must-have)

> Цель фазы: продавец проходит полный цикл без stubs. Оценка: 2–4 agent-сессии.

---

### Task A1: Auto-generate `order_number`

**Files:**
- Modify: `backend/orders/models.py`
- Modify: `backend/orders/serializers.py`
- Test: `backend/orders/test_order_number.py` (create)

- [ ] **Step 1: Write failing test**

```python
# backend/orders/test_order_number.py
import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from orders.models import Order, SalesChannel

@pytest.mark.django_db
def test_create_order_auto_assigns_order_number():
    user = User.objects.create_user(username='s1', email='s1@t.com', password='pwd', role='seller')
    channel = SalesChannel.objects.create(name='Сайт')
    api = APIClient()
    api.force_authenticate(user=user)
    res = api.post('/api/v1/orders/orders/', {
        'order_date': timezone.now().date().isoformat(),
        'sales_channel': channel.pk,
    })
    assert res.status_code == 201, res.data
    assert res.data['order_number'] >= 1
    assert Order.objects.get(pk=res.data['id']).seller_id == user.id
```

- [ ] **Step 2: Run test — expect FAIL** (400 order_number required)

```powershell
cd backend; python -m pytest orders/test_order_number.py -v
```

- [ ] **Step 3: Implement**

In `Order.save()` before `super().save()` when `not self.pk` and not `self.order_number`:

```python
from django.db.models import Max
# inside save:
if not self.pk and not self.order_number:
    last = Order.objects.aggregate(m=Max('order_number'))['m'] or 0
    self.order_number = last + 1
```

In `OrderSerializer.Meta` make `order_number` optional on input:

```python
extra_kwargs = {'order_number': {'required': False}}
```

Keep unique constraint. Accept race → IntegrityError rare; optional retry later (YAGNI for now).

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Commit** `feat(orders): auto-generate order_number on create`

---

### Task A2: Lock down mass-assignment on Client & Order

**Files:**
- Modify: `backend/clients/serializers.py`
- Modify: `backend/orders/serializers.py`
- Test: `backend/clients/test_rbac.py` or NEW `backend/clients/test_serializer_fields.py`

- [ ] **Step 1: Failing test** — seller/manager PUT cannot set `total_budget`

```python
@pytest.mark.django_db
def test_client_total_budget_not_writable_via_api():
    mgr = User.objects.create_user(username='m', email='m@t.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='A', total_budget=0, seller=mgr)
    api = APIClient()
    api.force_authenticate(user=mgr)
    res = api.patch(f'/api/v1/clients/clients/{client.pk}/', {'total_budget': '99999.00'})
    assert res.status_code == 200
    client.refresh_from_db()
    assert float(client.total_budget) == 0.0
```

- [ ] **Step 2: Implement** — explicit fields or `read_only_fields`:

```python
# ClientSerializer.Meta
read_only_fields = (
    'total_budget', 'first_purchase_date', 'last_purchase_date',
    'purchase_category', 'created_at', 'updated_at', 'primary_phone', 'grill_type_display',
)

# OrderSerializer.Meta
read_only_fields = (
    'created_by', 'completed_at', 'created_at', 'updated_at',
    'seller_name', 'client_name', 'client_last_name', 'sales_channel_name',
    'status_display', 'total', 'items',
)
```

Note: `seller` stays writable for manager; sellers already forced in `perform_*`.

- [ ] **Step 3: pytest clients + orders — PASS**
- [ ] **Step 4: Commit** `fix(api): make budget and completed_at read-only`

---

### Task A3: Client create with phone + list filter

**Files:**
- Modify: `backend/clients/serializers.py`
- Modify: `backend/clients/views.py` (`filterset_fields = ['client']` on ClientPhoneViewSet)
- Test: `backend/clients/test_phones.py`

- [ ] **Step 1: Failing test**

```python
@pytest.mark.django_db
def test_create_client_with_phone_write_only_field():
    user = User.objects.create_user(username='s', email='s@t.com', password='pwd', role='seller')
    api = APIClient()
    api.force_authenticate(user=user)
    res = api.post('/api/v1/clients/clients/', {
        'first_name': 'Иван',
        'phone': '+375291112233',
    })
    assert res.status_code == 201, res.data
    assert res.data['primary_phone'] == '+375291112233'
    assert ClientPhone.objects.filter(client_id=res.data['id'], number='+375291112233', is_primary=True).exists()
```

- [ ] **Step 2: Implement** on `ClientSerializer`:

```python
phone = serializers.CharField(write_only=True, required=False, allow_blank=True)

def create(self, validated_data):
    phone = validated_data.pop('phone', None)
    client = super().create(validated_data)
    if phone:
        ClientPhone.objects.create(client=client, number=phone, is_primary=True)
    return client
```

Add `filterset_fields = ['client']` to `ClientPhoneViewSet`.

- [ ] **Step 3: PASS + commit** `feat(clients): accept phone on client create`

---

### Task A4: Payments — filter by order + business validation

**Files:**
- Modify: `backend/orders/views.py` (`OrderPaymentViewSet.filterset_fields = ['order']`)
- Modify: `backend/orders/serializers.py` (`OrderPaymentSerializer.validate`)
- Optional: add `payments = OrderPaymentSerializer(many=True, read_only=True)` to `OrderSerializer`
- Test: `backend/orders/test_payments.py`

Rules:
- `amount > 0`
- order status not in `completed`, `cancelled`
- sum(existing) + amount ≤ order.total_amount (+ 0.01 tolerance)

- [ ] Write tests for overpay → 400, filter `?order=` → only that order’s payments
- [ ] Implement validation
- [ ] Commit `feat(orders): validate payments and filter by order`

---

### Task A5: Status side-effects concurrency hardening

**Files:**
- Modify: `backend/orders/signals.py` and/or move transition side-effects into `OrderViewSet.perform_update` under `@transaction.atomic` + `Order.objects.select_for_update().get(pk=...)`

Recommended approach (cleaner than signals for money/stock):
1. Keep AuditLog in signals OR move all to view.
2. In `perform_update`, if `status` changing to `cancelled`/`completed`, lock row, re-read status, apply `WarehouseService` / `ClientService` once.

Minimum fix if keeping signals:
```python
# pre_save: 
old = Order.objects.select_for_update().filter(pk=instance.pk).values_list('status', flat=True).first()
```
(requires being inside `transaction.atomic` in the view — wrap `OrderViewSet.perform_update` and `perform_create` already partial).

- [ ] Add test that documents expected single budget credit (sequential double-complete already blocked by state machine)
- [ ] Implement lock in perform_update path
- [ ] Commit `fix(orders): lock order row on status side-effects`

---

### Task A6: Fix `load_mock_data` stock reservation

**Files:**
- Modify: `backend/common/management/commands/load_mock_data.py`

After creating `OrderItem` for reserved order `o2`, call:

```python
from warehouse.services import WarehouseService
WarehouseService.reserve_stock_for_item(item)
```

Or create items only via service. Ensure stock p1 ends at 8-2=6.

- [ ] Manually verify: `load_mock_data` then GET stock for WEB-310 == 6
- [ ] Commit `fix(mock): reserve stock when seeding order items`

---

### Task A7: FE Role shell — landing + RoleRoute + Logout

**Files:**
- Modify: `frontend/src/pages/Login.jsx`
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/components/RoleRoute.jsx`
- Modify: `frontend/src/components/Layout/Sidebar.jsx`

- [ ] **Login:** after `/me/`, `navigate(role === 'manager' ? '/' : '/orders')`
- [ ] **RoleRoute:** if `localStorage.user_role` not in `roles`, `<Navigate to="/orders" />`
- [ ] Wrap Dashboard, Users, Audit with `roles={['manager']}`
- [ ] **Sidebar:** button «Выйти» → clear tokens + `navigate('/login')` (reuse logout from `api.js` — export it)
- [ ] Export `logout` from `api.js`
- [ ] Smoke UI: seller login lands on `/orders` without analytics error
- [ ] Commit `feat(fe): role landing, route guards, logout`

---

### Task A8: FE Order create form

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`

For `id === 'new'`, initialize:

```javascript
setOrder({
  items: [],
  order_date: new Date().toISOString().slice(0, 10),
  sales_channel: '',
  status: 'reserved',
  discount_percent: 0,
  comment: '',
  client: null,
});
```

- Required UI: date, sales_channel Select (from loaded channels), optional client (after A9)
- Save: `POST` only writable fields (`order_date`, `sales_channel`, `client`, `discount_percent`, `comment`, `delivery_service`, `tracking_number`, `status`) — **not** full GET blob; use PATCH for updates
- Do not send `order_number` (server assigns)
- Disable Save while `saving === true`
- Show field errors via `extractApiError`

- [ ] Manual/API: create order as seller → 201, redirect to `/orders/:id`
- [ ] Commit `feat(fe): working new order form`

---

### Task A9: FE Client picker + phone on client

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx` (replace stub dialog)
- Modify: `frontend/src/pages/ClientDetail.jsx`

**Client picker dialog:**
- Search `GET /clients/clients/?search=`
- Select → set `order.client` to id; show name
- Prefill: if navigate from ClientDetail «Новая сделка», use `?client=<id>` query

**ClientDetail:**
- On create: send `phone` write_only field (A3)
- `grill_type`: Select with charcoal/gas/ceramic
- Load phones: `GET /clients/client_phones/?client=<id>`
- Add phone form → POST client_phones
- Stop putting `total_budget` in editable form fields (read-only display)

- [ ] Commit `feat(fe): client picker and phones`

---

### Task A10: FE Order items — VAT, qty, delete

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Modify: `frontend/src/components/ProductSearchModal.jsx`

**Price rule (document in UI label «Цена без НДС»):**
```javascript
// rrp in catalog is WITH VAT → store ex-VAT on order item
const priceExVat = product.rrp
  ? (parseFloat(product.rrp) / 1.2)
  : parseFloat(product.base_cost_price) * 1.5;
```

- Qty: inline TextField → `PATCH /orders/order_items/:id/` `{ quantity }`
- Delete: button + `window.confirm` → `DELETE /orders/order_items/:id/`
- Disable mutations when `order.status` in `completed|cancelled`
- Refresh order after each change

- [ ] Commit `feat(fe): order item qty edit/delete and correct VAT`

---

### Task A11: FE Payments UI

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`

Replace stub with:
- List payments: `GET /orders/order_payments/?order=<id>` (or nested if A4 added)
- Form: payment_type Select (bound state), amount number → `POST /orders/order_payments/`
- Show `paid` vs `order.total` remaining
- Hide/disable on terminal orders
- Confirm before delete payment if you add delete

- [ ] Commit `feat(fe): order payments`

---

### Task A12: FE Status UX

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`

```javascript
const ALLOWED = {
  reserved: ['confirmed', 'cancelled'],
  confirmed: ['in_delivery', 'completed', 'cancelled'],
  in_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
```

- Select options = current + allowed
- Confirm dialog before `cancelled`
- Save status via PATCH `{ status }` only (avoid full PUT)

- [ ] Commit `feat(fe): status transition UX`

---

### Task A13: Phase A verification gate

- [ ] `cd backend; python -m pytest -q` → 0 failed
- [ ] Extend `smoke_api.py`: create order without order_number → 201; create client+phone → primary_phone set; patch budget ignored
- [ ] Extend `smoke_ui.py`: seller login → URL contains `/orders`; create order happy path if feasible
- [ ] `load_mock_data` + check stock math
- [ ] Commit `test: phase A smoke coverage`

**Phase A exit:** продавец проходит цикл без «В разработке» на критичном пути.

---

# PHASE B — Менеджер и справочники

> Зависит от Phase A. Оценка: 1–2 agent-сессии.

### Task B1: Delete order in UI (manager only)

- Button on `OrderDetail` if `user_role === 'manager'`
- Confirm: «Удалить заказ? Товар вернётся на склад (если заказ не завершён/отменён).»
- `DELETE /orders/orders/:id/` → navigate `/orders`
- Product decision for **completed** orders: either hide delete, or implement budget reverse in `perform_destroy` (prefer **hide delete** for completed — YAGNI reverse)

### Task B2: Role-gate Catalog / Warehouse write

- Hide «НОВЫЙ ТОВАР» / «ПРИХОД» unless manager
- Warehouse: product Autocomplete instead of raw ID; PATCH quantity for manager
- Align Chip labels with backend tags: `Товар заканчивается`, `Нет в наличии`

### Task B3: Real list pagination & search

- Catalog & Warehouse: controlled `page`, `count` from API `count`, `onPageChange` → `?page=`
- Wire search TextField + button to `?search=`
- Remove fake `page={0}` / noop handlers

### Task B4: Dashboard seller-safe

- Already redirected (A7); ensure direct `/` as seller shows friendly «Недостаточно прав» + link to orders (not raw axios dump)

### Task B5: Commit + pytest + smoke

---

# PHASE C — Polish (Guidelines)

> Не блокирует ежедневную работу, но нужно до «продуктового» качества.

### Task C1: Accessibility & forms
- Labels/`htmlFor`, `autocomplete` on Login, `aria-label` on icon/checkbox, `aria-live` for errors (replace alert where easy)

### Task C2: Intl & content
- Use `formatCurrency` / `Intl.DateTimeFormat('ru-RU')` on Orders, OrderDetail, Clients
- Empty states on empty lists
- Loading text with `…`

### Task C3: Navigation
- Prefer `Link`/`navigate` without row-checkbox conflict (`stopPropagation` on Checkbox)
- Filters/search in URL query (`?search=&page=`) on Orders/Clients

### Task C4: Mobile Layout
- Sidebar `variant={mobile ? 'temporary' : 'permanent'}` with Menu icon

### Task C5: Dead code cleanup
- Remove stub dialogs, unused imports, unused zustand dep if still unused, orphan CSS if confirmed unused

### Task C6: Final gate
- Full pytest, smoke_api, smoke_ui, optional prod-compose smoke
- Update this plan checkboxes / CHANGELOG note in commit message

---

## Out of scope (explicit YAGNI for this plan)

- Real TLS certificates / production host provisioning
- Admin.py registration (nice, not required for FE)
- Nested atomic create order+items in one POST (two-step is fine after A8)
- Concurrent stress tests for status races beyond lock fix
- Replacing MUI / redesign brand

---

## Spec coverage checklist (self-review)

| Audit finding | Task |
|---|---|
| Order create 400 / no order_number | A1, A8 |
| total_budget writable | A2 (+ empirical proof) |
| phone dropped | A3, A9 |
| VAT/RRP wrong | A10 |
| Seller → Dashboard 403 | A7 |
| No logout | A7 |
| Payment stub | A4, A11 |
| Client picker stub | A9 |
| No item qty/delete | A10 |
| Status UX / cancel confirm | A12 |
| Concurrent status double effects | A5 |
| Mock stock not reserved | A6 |
| No order delete UI | B1 |
| Seller write buttons catalog/warehouse | B2 |
| Fake pagination | B3 |
| Guidelines a11y/Intl/mobile | C1–C4 |
| Payments overpay | A4 |
| completed_at writable | A2 |

No TBD placeholders in tasks above.

---

## Execution handoff

**Plan saved to** `docs/superpowers/plans/2026-08-09-crm-readiness.md`.

**Два варианта исполнения:**

1. **Subagent-Driven (рекомендуется)** — свежий субагент на каждую задачу Wave 0 → A13, ревью между задачами  
2. **Inline Execution** — выполнять задачи в этой сессии пакетами с чекпоинтами  

Напишите `1` или `2` (и с какой задачи стартовать — обычно **A1**).
