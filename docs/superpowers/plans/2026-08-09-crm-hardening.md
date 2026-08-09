# Hardening - CRM readiness follow-ups

> **STATUS: COMPLETED** (H1-H7) - verified 2026-08-09
> **Evidence:** pytest **42 passed**; smoke_api **20 passed**; smoke_ui **14 passed**
> **Commits:** `47d019c` (H1-H3), `e9e1721` (H4), `7f7e72a` (H6), `069f4d4` (H5), plus H7 Postgres lock join fix on `OrderViewSet.update`

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or execute task-by-task with TDD.

**Goal:** Close Important gaps from `2026-08-09-crm-readiness-VERIFICATION.md` so daily CRM is concurrency-safer and smoke covers seller path.

**Tech:** Django/DRF orders + React OrderDetail + Playwright smoke_ui.

---

## File map

| Area | Files |
|------|--------|
| Status lock | `backend/orders/views.py`, `backend/orders/test_status.py` (or new) |
| Payments lock/destroy | `backend/orders/views.py`, `backend/orders/test_payments.py` |
| Completed order delete | `backend/orders/views.py`, tests |
| Sequential item add | `frontend/src/pages/OrderDetail.jsx` |
| Seller E2E smoke | `backend/scripts/smoke_ui.py` |
| ClientDetail stub | `frontend/src/pages/ClientDetail.jsx` |

---

### Task H1: Lock order before status validation

**COMPLETED** - commit `47d019c`; H7 fixed Postgres FOR UPDATE on joined queryset

- Override `OrderViewSet.update`/`partial_update` (or single `update`) with `@transaction.atomic`: `select_for_update()` → `refresh` → serializer validate → save.
- Keep `perform_update` side-effects; avoid double-lock issues (same transaction OK).
- Test: concurrent-ish — create order reserved; force status to confirmed in DB mid-flight OR unit test that validate uses locked fresh status (prefer API test documenting illegal transition still 400 after race setup).
- Commit: `fix(orders): lock row before status validation`

### Task H2: Payment create under order lock + terminal destroy guard

**COMPLETED** - commit `47d019c`

- `OrderPaymentViewSet.perform_create`: `transaction.atomic` + `Order.objects.select_for_update().get(pk=order.pk)` then re-check overpay / terminal (or refresh serializer inputs).
- `perform_update` same lock if amount/order can change.
- `perform_destroy`: raise if order is completed/cancelled (`_ensure_order_active` or dedicated message for payments).
- Tests in `test_payments.py`.
- Commit: `fix(orders): lock payments and block terminal deletes`

### Task H3: Block API delete of completed orders

**COMPLETED** - commit `47d019c`

- In `OrderViewSet.perform_destroy` (or `destroy`): if `status == completed` → `ValidationError` («Нельзя удалить завершённый заказ»).
- Cancelled may still be deleted (stock already released).
- Test + keep FE hide behavior.
- Commit: `fix(orders): forbid deleting completed orders`

### Task H4: Sequential order item adds in FE

**COMPLETED** - commit `e9e1721`

- `handleAddProducts`: replace `Promise.all` with sequential `for...of` + await; on first failure stop and show `extractApiError`; refresh order after successful adds (or after each).
- Commit: `fix(fe): add order items sequentially`

### Task H5: smoke_ui seller happy-path (minimal)

**COMPLETED** - commit `069f4d4`; smoke_ui includes seller create-order

- After seller login: open `/orders/new` or navigate new order; create order with channel+date (pick existing channel from UI); optionally soft-check elements exist rather than full fragile flow if flaky.
- Prefer: create client via UI or API setup + UI order create landing without «В разработке»; add one product if ProductSearchModal is stable; if too flaky, at least: seller opens `/orders/new`, fills required fields, saves, lands on `/orders/:id` with order number visible.
- Commit: `test: smoke_ui seller create-order path`

### Task H6: ClientDetail order-history search stub

**COMPLETED** - commit `7f7e72a`

- Either wire search to filter client orders client-side, or remove unbound search/filter/ПОИСК UI to avoid fake controls.
- Prefer remove/simplify if orders list is small nested data.
- Commit: `fix(fe): clean ClientDetail order history controls`

### Task H7: Gate

**COMPLETED** - pytest 42 / smoke_api 20 / smoke_ui 14; VERIFICATION status=passed

- pytest + smoke_api + smoke_ui
- Update VERIFICATION.md status notes
- Commit docs if changed

---

## Out of scope

- order_number Max()+1 race (explicit YAGNI)
- Full redesign OrderDetail alerts → aria-live
- Catalog/Warehouse URL sync
