# Post-audit quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть техдолг и UX-дыры из аудитов 2026-08-09 (project / frontend / UI-UX), не ломая зелёный regression gate (pytest 42, smoke_api, smoke_ui).

**Architecture:** Сначала общая FE-инфраструктура обратной связи (Snackbar + Confirm dialog), затем точечная замена `alert`/`confirm` и a11y форм; параллельно лёгкие backend/ops фиксы. Тяжёлый рефактор `OrderDetail` — отдельная поздняя волна. Источник истины API не меняем без нужды.

**Tech Stack:** React 19 + MUI 9 + Vite · Django 6.1 + DRF · Docker Compose · pytest / smoke_api / smoke_ui

**Evidence base:**
- [project-review canvas](../../../../.cursor/projects/c-Users-syoma-gemini-antigravity-ide-scratch-crm-dom-vkusa/canvases/project-review.canvas.tsx) (пути локальные к IDE)
- Frontend: build OK, oxlint 3 warnings, chunk 1.08 MB
- UI/UX: P0 = alert/labels; readiness+hardening уже COMPLETED

**Out of scope (не делать в этом плане):** полный редизайн визуала, смена Inter, TypeScript migration, httpOnly cookie JWT.

---

## Success criteria

1. Нет `window.alert` / `window.confirm` в `frontend/src` (кроме возможно тестов).
2. Login при сбое `/me/` не ставит роль `user`.
3. Поисковые поля и ключевые формы имеют связанные labels / `aria-label`.
4. `html lang="ru"`; ProductSearchModal на русском.
5. OrderDetail: вкладка в URL (`?tab=0|1`); dirty-guard при уходе.
6. `npm run lint` без warnings (hooks deps); `npm run build` OK.
7. Backend: schema/docs закрыты при `DEBUG=False` (или IsAuthenticated); local `.venv` синхронизирован с `requirements.txt` (документировать в README или сделать).
8. Gate: `docker compose exec backend pytest -q` → 42+ passed; smoke_api / smoke_ui зелёные (или обновлены под новый UI, если селекторы сломались).

---

## File map

| Area | Create | Modify |
|------|--------|--------|
| Feedback infra | `frontend/src/components/FeedbackProvider.jsx`, `frontend/src/hooks/useFeedback.js` (или один файл) | `frontend/src/main.jsx` |
| Consumers | — | `OrderDetail.jsx`, `ClientDetail.jsx`, `Orders.jsx`, `Clients.jsx`, `Warehouse.jsx` |
| Auth | — | `frontend/src/pages/Login.jsx` |
| A11y / i18n | — | `index.html`, search TextFields, form captions → InputLabel/`label`, `ProductSearchModal.jsx` |
| OrderDetail URL/dirty | — | `OrderDetail.jsx` |
| Polish FE | — | `App.jsx` (lazy), `Warehouse.jsx` (cursor), delete dead CSS/assets |
| Backend ops | — | `backend/config/urls.py` or settings, sync `.venv` |
| Docs | this plan | optional short note in verification |

---

## Dependency graph

```text
Wave A  FeedbackProvider (Snackbar + confirm)
   └─► Wave B  Replace alert/confirm + Login role fix
         └─► Wave C  Labels / search aria / lang=ru
               └─► Wave D  OrderDetail ?tab= + dirty-guard
Wave E  FE polish (lazy, dead files, hooks)     ── parallel after A
Wave F  Backend/ops (docs auth, venv)           ── parallel anytime
Wave G  OrderDetail split (optional, large)     ── after D, only if time
Wave H  Final gate (lint, build, pytest, smokes)
```

---

### Task A1: FeedbackProvider — toast + confirm

**Files:**
- Create: `frontend/src/components/FeedbackProvider.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Add provider**

Создать `FeedbackProvider.jsx` с контекстом:

```jsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar,
} from '@mui/material';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [confirmState, setConfirmState] = useState(null); // { title, message, resolve }

  const notify = useCallback((message, severity = 'info') => {
    setToast({ open: true, message: String(message), severity });
  }, []);

  const confirm = useCallback((message, { title = 'Подтверждение' } = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ title, message: String(message), resolve });
    });
  }, []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </Alert>
      </Snackbar>
      <Dialog
        open={Boolean(confirmState)}
        onClose={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
        aria-labelledby="confirm-dialog-title"
      >
        <DialogTitle id="confirm-dialog-title">{confirmState?.title}</DialogTitle>
        <DialogContent>{confirmState?.message}</DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              confirmState?.resolve(false);
              setConfirmState(null);
            }}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              confirmState?.resolve(true);
              setConfirmState(null);
            }}
            autoFocus
          >
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap app in `main.jsx`**

```jsx
import { FeedbackProvider } from './components/FeedbackProvider.jsx'
// ...
<ThemeProvider theme={theme}>
  <CssBaseline />
  <FeedbackProvider>
    <App />
  </FeedbackProvider>
</ThemeProvider>
```

- [ ] **Step 3: Smoke check**

Run: `cd frontend && npm run build`  
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/FeedbackProvider.jsx frontend/src/main.jsx
git commit -m "feat(fe): add Snackbar/confirm FeedbackProvider"
```

---

### Task B1: Login — fix role fallback

**Files:**
- Modify: `frontend/src/pages/Login.jsx`

- [ ] **Step 1: Replace catch branch**

Вместо `role = 'user'` при ошибке `/me/`:

```jsx
} catch (e) {
  console.error('Failed to fetch user role', e);
  // Fail closed for RBAC UI: seller menu only until next login
  role = 'seller';
  localStorage.setItem('user_role', role);
}
```

Опционально лучше: `logout()` + `setError('Не удалось загрузить профиль. Войдите снова.')` и не `navigate` — предпочтительно:

```jsx
} catch (e) {
  console.error('Failed to fetch user role', e);
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_role');
  setError('Не удалось загрузить профиль. Попробуйте ещё раз.');
  return;
}
```

Выбрать второй вариант (logout + error). Не оставлять роль `user`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Login.jsx
git commit -m "fix(fe): do not set invalid user_role on /me/ failure"
```

---

### Task B2: Replace alert/confirm in list pages

**Files:**
- Modify: `frontend/src/pages/Orders.jsx`
- Modify: `frontend/src/pages/Clients.jsx`
- Modify: `frontend/src/pages/Warehouse.jsx`

- [ ] **Step 1: Orders.jsx**

```jsx
import { useFeedback } from '../components/FeedbackProvider';
// inside component:
const { notify, confirm } = useFeedback();

// alert('...') → notify('...', 'warning'|'error'|'success')
// if (!window.confirm(msg)) return → if (!(await confirm(msg))) return
```

Все вызовы `deleteOrdersByIds` / handlers сделать `async` где нужен `await confirm`.

- [ ] **Step 2: Clients.jsx** — то же для delete selected / errors.

- [ ] **Step 3: Warehouse.jsx** — `alert` при ошибке qty → `notify(..., 'error')`.

- [ ] **Step 4: Grep gate**

Run: `rg "alert\(|window\.confirm" frontend/src/pages/Orders.jsx frontend/src/pages/Clients.jsx frontend/src/pages/Warehouse.jsx`  
Expected: no matches

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Orders.jsx frontend/src/pages/Clients.jsx frontend/src/pages/Warehouse.jsx
git commit -m "fix(fe): replace alert/confirm on list pages with FeedbackProvider"
```

---

### Task B3: Replace alert/confirm in OrderDetail + ClientDetail

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx` (~25 alert/confirm sites)
- Modify: `frontend/src/pages/ClientDetail.jsx` (~6 sites)

- [ ] **Step 1: Wire `useFeedback`**

В начале компонента:

```jsx
const { notify, confirm } = useFeedback();
```

Mapping:
| Было | Стало |
|------|--------|
| `alert('Укажите…')` | `notify('Укажите…', 'warning')` |
| `alert('…создан/сохранен')` | `notify('…', 'success')` |
| `alert(\`Ошибка…\`)` | `notify(\`Ошибка…\`, 'error')` |
| `if (!window.confirm(...)) return` | `if (!(await confirm(...))) return` |

Handlers (`handleSave`, `handleStatusChange`, `handleDeleteOrder`, item/payment helpers) — `async` где нужен confirm.

- [ ] **Step 2: ClientDetail** — аналогично.

- [ ] **Step 3: Grep gate**

Run: `rg "alert\(|window\.confirm" frontend/src`  
Expected: no matches in `src` (кроме возможно FeedbackProvider)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/OrderDetail.jsx frontend/src/pages/ClientDetail.jsx
git commit -m "fix(fe): replace alert/confirm in order and client detail"
```

---

### Task C1: lang=ru + search aria-labels

**Files:**
- Modify: `frontend/index.html`
- Modify: `Orders.jsx`, `Clients.jsx`, `Catalog.jsx`, `Warehouse.jsx`, `ProductSearchModal.jsx`

- [ ] **Step 1: `index.html`**

```html
<html lang="ru">
```

- [ ] **Step 2: Search fields**

На каждом поиске:

```jsx
<TextField
  placeholder="Поиск…"
  size="small"
  inputProps={{ 'aria-label': 'Поиск заказов' }}  // или slotProps.input
  // ...
/>
```

MUI 9 предпочтительно:

```jsx
slotProps={{ input: { 'aria-label': 'Поиск заказов' } }}
```

Тексты:
- Orders: `Поиск заказов`
- Clients: `Поиск клиентов`
- Catalog / Warehouse: `Поиск товаров`
- ProductSearchModal search: соответствующий aria-label

Placeholder: заканчивать на `…` (не `...`).

- [ ] **Step 3: ProductSearchModal EN → RU**

`"Rows per page:"` → `"Строк на странице:"`  
`"of"` → `"из"` (если есть).

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/pages/*.jsx frontend/src/components/ProductSearchModal.jsx
git commit -m "fix(fe): lang=ru, search aria-labels, RU pagination copy"
```

---

### Task C2: Associate form labels (OrderDetail + ClientDetail critical fields)

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Modify: `frontend/src/pages/ClientDetail.jsx`

- [ ] **Step 1: Pattern**

Заменить пару `Typography caption` + `TextField`/`Select` без связи на:

```jsx
<TextField
  fullWidth
  size="small"
  label="Дата заказа"
  type="date"
  required
  InputLabelProps={{ shrink: true }}
  value={order.order_date || ''}
  onChange={(e) => handleChange('order_date', e.target.value)}
/>
```

Для Select:

```jsx
<FormControl fullWidth size="small" required>
  <InputLabel id="order-channel-label">Канал привлечения</InputLabel>
  <Select
    labelId="order-channel-label"
    label="Канал привлечения"
    value={order.sales_channel || ''}
    onChange={(e) => handleChange('sales_channel', e.target.value)}
  >
    ...
  </Select>
</FormControl>
```

Минимум покрыть: order_date, sales_channel, status, client phone fields, ClientDetail first/last name, email, phone.

Не обязательно переписывать весь ClientDetail за один проход — критичные editable fields в обоих detail pages.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/OrderDetail.jsx frontend/src/pages/ClientDetail.jsx
git commit -m "a11y(fe): associate labels with order/client form controls"
```

---

### Task D1: OrderDetail tab in URL

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`

- [ ] **Step 1: Sync tab ↔ searchParams**

Уже есть `useSearchParams`. Добавить:

```jsx
const tabFromUrl = Number(searchParams.get('tab') || '0');
const tab = tabFromUrl === 1 ? 1 : 0;

const setTab = (next) => {
  const params = new URLSearchParams(searchParams);
  params.set('tab', String(next));
  // preserve other params e.g. client=
  setSearchParams(params, { replace: true });
};
```

Убрать локальный `useState` для tab (или синхронизировать через effect — предпочтительно derived from URL).

Кнопки табов: `onClick={() => setTab(0)}` / `setTab(1)`.

- [ ] **Step 2: Manual check**

Open `/orders/<id>?tab=1` → видна вкладка «Товары и оплата».  
Refresh сохраняет вкладку.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/OrderDetail.jsx
git commit -m "feat(fe): deep-link order detail tabs via ?tab="
```

---

### Task D2: Dirty-guard on OrderDetail (+ ClientDetail if easy)

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Optionally: `frontend/src/pages/ClientDetail.jsx`

- [ ] **Step 1: Dirty detection**

```jsx
const isDirty = useMemo(() => {
  if (!order || !baseline) return false;
  if (isNew) {
    return Boolean(order.order_date || order.sales_channel || order.client || order.comment);
  }
  return Object.keys(diffWritable(order, baseline)).length > 0;
}, [order, baseline, isNew]);
```

- [ ] **Step 2: beforeunload**

```jsx
useEffect(() => {
  if (!isDirty) return undefined;
  const onBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => window.removeEventListener('beforeunload', onBeforeUnload);
}, [isDirty]);
```

- [ ] **Step 3: In-app navigation (best-effort)**

Обернуть критичные `navigate(...)` после успешных save/delete — OK.  
Для Sidebar links: опционально `useBlocker` из react-router 7 если уже доступен:

```jsx
import { useBlocker } from 'react-router-dom';
// ...
const blocker = useBlocker(isDirty);
useEffect(() => {
  if (blocker.state !== 'blocked') return;
  (async () => {
    const ok = await confirm('Есть несохранённые изменения. Уйти без сохранения?');
    if (ok) blocker.proceed();
    else blocker.reset();
  })();
}, [blocker, confirm]);
```

Если `useBlocker` требует data router — и сейчас `BrowserRouter`: либо мигрировать на `createBrowserRouter` (больше scope), либо ограничиться `beforeunload` в этом task. **Предпочтение плана:** только `beforeunload` в D2; data-router blocker — follow-up, не блокирует DoD.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/OrderDetail.jsx
git commit -m "feat(fe): warn on unload when order form is dirty"
```

---

### Task E1: FE polish — hooks deps, dead assets, Warehouse cursor, lazy Dashboard

**Files:**
- Modify: `Catalog.jsx`, `Warehouse.jsx`, `ProductSearchModal.jsx`
- Modify: `App.jsx`
- Delete (если не используются): `frontend/src/App.css`, `frontend/src/index.css` (confirm no imports), unused `src/assets/react.svg` / `vite.svg` if unused
- Modify: `Warehouse.jsx` — убрать `cursor: 'pointer'` со строки без onClick

- [ ] **Step 1: Fix exhaustive-deps**

Вариант A (простой): обернуть `fetchX` в `useCallback` с deps и указать в `useEffect`.  
Вариант B: inline fetch в useEffect (как в Orders) — предпочтительно для консистентности со списками.

- [ ] **Step 2: Lazy-load Dashboard**

```jsx
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import('./pages/Dashboard'));
// route:
<Route index element={
  <RoleRoute roles={['manager']}>
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  </RoleRoute>
} />
```

Опционально lazy для AuditLog/Users.

- [ ] **Step 3: lint + build**

```bash
cd frontend && npm run lint && npm run build
```

Expected: 0 warnings; build OK; chunk для dashboard отдельно желателен.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "chore(fe): fix hooks deps, lazy Dashboard, remove dead cursor/CSS"
```

---

### Task F1: Backend — protect schema/docs when DEBUG=False

**Files:**
- Modify: `backend/config/urls.py` and/or `backend/config/settings.py`

- [ ] **Step 1: Gate spectacular views**

```python
from django.conf import settings
from rest_framework.permissions import IsAdminUser, AllowAny

# In urlpatterns, wrap or subclass:
docs_permission = AllowAny if settings.DEBUG else IsAdminUser

path('api/schema/', SpectacularAPIView.as_view(permission_classes=[docs_permission]), ...),
path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema', permission_classes=[docs_permission]), ...),
```

Проверить, что Spectacular* принимает `permission_classes` в as_view — если нет, использовать decorator view или `SPECTACULAR_SETTINGS` + custom.

Альтернатива проще: в urls.py

```python
from django.contrib.auth.decorators import login_required_staff_only  # or staff_member_required
```

Для JWT API admin session может не быть — тогда `IsAuthenticated` + IsManager permission class из `common.permissions`.

**Рекомендация:** `permission_classes=[IsAuthenticated]` всегда + дополнительно в DEBUG AllowAny optional. Или: только при DEBUG регистрировать docs routes.

```python
urlpatterns = [ ... core ... ]
if settings.DEBUG:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    ]
```

Предпочтительный простой вариант: **docs только при DEBUG**.

- [ ] **Step 2: Test**

```bash
docker compose exec backend pytest -q
```

Expected: still green (tests don't need swagger).

- [ ] **Step 3: Commit**

```bash
git add backend/config/urls.py
git commit -m "security: expose OpenAPI docs only when DEBUG"
```

---

### Task F2: Sync local `.venv` with requirements

**Files:**
- Ops only (не коммитить venv)

- [ ] **Step 1: Reinstall**

```bash
cd c:\Users\syoma\.gemini\antigravity-ide\scratch\crm-dom-vkusa
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -c "import environ, django; print(django.get_version())"
```

Expected: Django 6.1.x, environ imports.

- [ ] **Step 2: Host pytest**

```bash
cd backend
..\ .venv\Scripts\python.exe -m pytest -q
```

Expected: 42 passed (or same as Docker).

- [ ] **Step 3: Note in commit?**  
Не коммитить. Если хочется — одна строка в `frontend/README.md` или root note: «локально: pip install -r backend/requirements.txt». Только если уже есть README с setup — иначе skip docs.

---

### Task G1 (optional): Split OrderDetail — only if Waves A–F done and time remains

**Files:**
- Create: `frontend/src/pages/orderDetail/OrderHeader.jsx`, `OrderMetaForm.jsx`, `OrderItemsPanel.jsx`, `OrderPaymentsPanel.jsx`, `orderConstants.js`
- Modify: `OrderDetail.jsx` → thin container

Не начинать, пока D2 не смержен. Цель: файл <400 строк контейнер. Поведение 1:1. После split — smoke_ui.

---

### Task H1: Final gate

- [ ] **Step 1: Frontend**

```bash
cd frontend && npm run lint && npm run build
```

Expected: clean lint, build OK

- [ ] **Step 2: Backend tests**

```bash
docker compose exec -T backend python -m pytest -q
```

Expected: ≥42 passed

- [ ] **Step 3: Smokes (stack must be up)**

```bash
docker compose exec -T backend python scripts/smoke_api.py
docker compose exec -T backend python scripts/smoke_ui.py
```

Expected: all passed. Если UI-селекторы сломались из-за label/Dialog — починить smoke, не откатывать UX.

- [ ] **Step 4: Verification doc**

Create/update: `docs/superpowers/plans/2026-08-09-post-audit-quality-VERIFICATION.md` с таблицей Success criteria + evidence (как в readiness verification).

- [ ] **Step 5: Commit verification**

```bash
git add docs/superpowers/plans/2026-08-09-post-audit-quality-VERIFICATION.md
git commit -m "docs: verify post-audit quality gate"
```

---

## Self-review checklist

| Audit finding | Task |
|---------------|------|
| alert/confirm UX P0 | A1, B2, B3 |
| Login role `user` | B1 |
| Form labels / search aria | C1, C2 |
| lang=en / EN pagination | C1 |
| Order tabs not in URL | D1 |
| No unsaved warning | D2 |
| Hooks lint warnings | E1 |
| Bundle / lazy | E1 |
| Dead CSS / false cursor | E1 |
| Swagger open in prod | F1 |
| Local venv drift | F2 |
| OrderDetail monolith | G1 optional |
| DRF Django shim / mock pwd 123 | **deferred** (track only; not in DoD) |
| JWT localStorage XSS | **deferred** (out of scope) |
| Pagination PAGE_SIZE noop | **deferred** (low) |

Deferred items: не блокируют закрытие плана; завести follow-up при необходимости.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-09-post-audit-quality.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
