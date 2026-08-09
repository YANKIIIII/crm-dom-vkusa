---
phase: crm-readiness-A-C + hardening-H1-H7
verified: 2026-08-09T21:25:00Z
status: passed
score: 9/9 must-haves verified
is_re_verification: true
empirical:
  pytest: 42 passed (43.08s)
  smoke_api: 20 passed, 0 failed
  smoke_ui: 14 passed, 0 failed
  frontend_build: ok (prior; not re-run this gate)
gaps: []
hardening:
  H1-H6: done (commits 47d019c, e9e1721, 7f7e72a, 069f4d4)
  H7: gate green; Postgres select_for_update join fix on Order.update
hardening_followups: []
---

# CRM Readiness Verification (Phases A-C + Hardening H1-H7)

## Must-Haves (plan Success criteria)

### Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| 1. Seller lands on orders | VERIFIED | Login + RoleRoute; smoke_ui seller `/orders` |
| 2. Client + phone | VERIFIED | serializers + ClientDetail; smoke_api phone |
| 3. Order auto-number + create | VERIFIED | models Max+1; smoke_api 201 + order_number |
| 4. Items VAT/qty/delete | VERIFIED | OrderDetail wired; backend stock service |
| 5. Payments + status + Logout | VERIFIED | serializers/views + FE; Sidebar logout |
| 6. Manager delete active order | VERIFIED | canDeleteOrder; smoke_ui delete button |
| 7. Seller read-only catalog/warehouse | VERIFIED | FE isManager + API IsManagerOrReadOnly; smoke PATCH 403 |
| 8. Seller `/` friendly forbidden | VERIFIED | RoleRoute Alert; smoke_ui |
| 9. Regression harness green | VERIFIED | **H7 gate:** pytest 42; smoke_api 20; smoke_ui 14 |

### Artifacts (spot-check)

| Path | Exists | Substantive | Wired |
|------|--------|-------------|-------|
| frontend/src/pages/OrderDetail.jsx | yes | yes | yes |
| frontend/src/components/RoleRoute.jsx | yes | yes | yes |
| backend/orders/serializers.py | yes | yes | yes |
| backend/scripts/smoke_api.py | yes | yes | yes |
| backend/scripts/smoke_ui.py | yes | yes | yes |

### Key Links

| From | To | Via | Status |
|------|-----|-----|--------|
| OrderDetail | `/orders/orders/` | POST/PATCH/DELETE | WIRED |
| OrderDetail | order_items / payments | api | WIRED |
| Catalog/Warehouse | product_cards / stock_items | page+search | WIRED |
| RoleRoute | manager routes | App.jsx | WIRED |

## Hardening H1-H6

| Task | Status | Evidence SHA |
|------|--------|--------------|
| H1 Status lock before validate | done | 47d019c (+ H7 Postgres join fix: plain `Order.objects.select_for_update`) |
| H2 Payment lock + terminal destroy | done | 47d019c |
| H3 Forbid delete completed orders | done | 47d019c |
| H4 Sequential item adds (FE) | done | e9e1721 |
| H5 smoke_ui seller create-order | done | 069f4d4 |
| H6 ClientDetail stub cleanup | done | 7f7e72a |
| H7 Final gate | done | pytest 42 / smoke_api 20 / smoke_ui 14 |

## Anti-Patterns

- Catalog/Warehouse `onRowsPerPageChange` noop with fixed PAGE_SIZE (out of hardening scope)
- No fake stub CTAs on Catalog/Warehouse
- ClientDetail unbound order-history controls removed (H6)

## Fresh empirical run (H7 gate, 2026-08-09)

```
pytest:     42 passed in 43.08s
smoke_api:  20 passed, 0 failed
smoke_ui:   14 passed, 0 failed
Docker:     backend restarted; :8000, frontend :5173, db healthy
HEAD at gate start: 069f4d4
```

## Code review / hardening notes

- Prior Important gaps (status race, payment lock/delete, completed delete, Promise.all items, seller smoke, ClientDetail stubs) closed by H1-H6.
- H7 surfaced Postgres `FOR UPDATE` + outer-join failure on `OrderViewSet.update`; fixed by locking `Order.objects` without `select_related` joins.

## Human Verification

Optional browser spot-check remains useful but **not required** for gate status: seller create-order path is covered by smoke_ui (14 checks including create to `/orders/<id>`).

## Verdict

**status: passed** — automated DoD **9/9**, hardening H1-H7 complete, fresh regression green (pytest 42, smoke_api 20, smoke_ui 14).
