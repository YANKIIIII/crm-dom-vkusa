"""Browser smoke against http://localhost:5173 using Playwright."""
from __future__ import annotations

import re
import sys
from datetime import date

from playwright.sync_api import sync_playwright, expect


BASE = 'http://localhost:5173'
PASS = 0
FAIL = 0


def check(name, ok, detail=''):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'[OK] {name}')
    else:
        FAIL += 1
        print(f'[FAIL] {name} {detail}')


def login(page, username, password):
    page.goto(f'{BASE}/login', wait_until='networkidle')
    page.get_by_label('Логин').fill(username)
    page.get_by_label('Пароль').fill(password)
    page.get_by_role('button', name='Войти').click()
    page.wait_for_url(lambda url: '/login' not in url, timeout=15000)


def seller_create_order(seller):
    """Seller happy-path: /orders/new → fill required → save → land on detail."""
    seller.goto(f'{BASE}/orders/new', wait_until='networkidle')
    seller.get_by_text('Новый заказ', exact=False).wait_for(timeout=15000)

    # Soft: form chrome present
    has_channel_label = seller.get_by_text('Канал привлечения', exact=False).count() > 0
    has_date_label = seller.get_by_text('Дата заказа', exact=False).count() > 0
    if has_channel_label and has_date_label:
        check('seller /orders/new shows required fields (soft)', True)
    else:
        print('[SOFT] create-order form labels missing (non-blocking)')

    # Order date (defaults to today; set if empty)
    date_input = seller.locator('input[type="date"]').first
    date_input.wait_for(state='visible', timeout=10000)
    if not (date_input.input_value() or '').strip():
        date_input.fill(date.today().isoformat())

    # Sales channel: searchable Autocomplete, pick first option
    channel = seller.get_by_label('Канал привлечения')
    channel.wait_for(state='visible', timeout=10000)
    channel.click()
    real_option = seller.locator('[role="listbox"] [role="option"]').first
    real_option.wait_for(state='visible', timeout=10000)
    real_option.click()

    seller.get_by_role('button', name=re.compile(r'СОХРАНИТЬ\s+ЗАКАЗ', re.I)).click()

    # Hard: must leave /orders/new for /orders/<id>
    try:
        seller.wait_for_url(
            lambda url: bool(re.search(r'/orders/\d+', url)) and '/orders/new' not in url,
            timeout=20000,
        )
        seller.wait_for_load_state('networkidle')
    except Exception as e:
        check(
            'seller create-order lands on /orders/<id>',
            False,
            f'url={seller.url} err={e}',
        )
        return

    detail_ok = bool(re.search(r'/orders/\d+', seller.url)) and '/orders/new' not in seller.url
    body = seller.locator('body').inner_text()
    shows_order = bool(re.search(r'#\d+', body)) or 'Заказ' in body
    check(
        'seller create-order lands on /orders/<id>',
        detail_ok and shows_order,
        f'url={seller.url} body={body[:160]!r}',
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Frontend loads
        resp = page.goto(BASE, wait_until='networkidle')
        check('frontend responds', resp is not None and resp.ok, f'status={getattr(resp, "status", None)}')

        # Redirect to login when unauthenticated
        page.goto(BASE, wait_until='networkidle')
        check('unauthenticated redirect to login', '/login' in page.url, f'url={page.url}')

        # Manager login
        login(page, 'aleksey', '123')
        check('manager login lands off /login', '/login' not in page.url, f'url={page.url}')
        body = page.locator('body').inner_text()
        check('manager sees app chrome', 'Дом' in body or 'Заказ' in body or 'Клиент' in body, body[:120])

        # Navigate to orders
        page.goto(f'{BASE}/orders', wait_until='networkidle')
        check('orders page loads', page.locator('body').count() == 1)
        page.wait_for_selector('table tbody tr input[type="checkbox"]', timeout=15000)
        content = page.content()
        check('orders list shows mock order 1111', '1111' in content)

        # List multi-select + delete outside order card (manager)
        first_row = page.locator('table tbody tr').first
        row_cb = first_row.locator('input[type="checkbox"]')
        row_cb.check()
        bulk = page.get_by_role('button', name=re.compile(r'Удалить выбранные', re.I))
        check('manager list shows bulk delete after select', bulk.count() > 0)
        row_del = page.get_by_role('button', name=re.compile(r'Удалить заказ', re.I))
        check('manager list has per-row delete control', row_del.count() > 0)
        row_cb.uncheck()

        # Open order via #number link (not whole row / checkbox)
        order_link = page.get_by_text('#1111', exact=True)
        if order_link.count() == 0:
            order_link = page.locator('table tbody tr').first.get_by_text(re.compile(r'#\d+'))
        order_num = order_link.first.inner_text().lstrip('#')
        order_link.first.click()
        page.wait_for_url(re.compile(r'/orders/\d+'), timeout=15000)
        page.wait_for_load_state('networkidle')
        page.get_by_text(f'Заказ {order_num}', exact=False).wait_for(timeout=15000)
        delete_btn = page.get_by_role('button', name=re.compile(r'Удалить заказ', re.I))
        try:
            delete_btn.first.wait_for(state='visible', timeout=10000)
            has_delete = True
        except Exception as e:
            has_delete = False
            print(f'       delete wait error: {e}')
        check(
            'manager sees delete on non-terminal order',
            has_delete,
            f'url={page.url}',
        )

        # Clients list multi-select (manager)
        page.goto(f'{BASE}/clients', wait_until='networkidle')
        page.wait_for_selector('table tbody tr input[type="checkbox"]', timeout=15000)
        page.locator('table tbody tr').first.locator('input[type="checkbox"]').check()
        check(
            'manager clients bulk delete after select',
            page.get_by_role('button', name=re.compile(r'Удалить выбранных', re.I)).count() > 0,
        )
        check(
            'manager clients per-row delete',
            page.get_by_role('button', name=re.compile(r'Удалить клиента', re.I)).count() > 0,
        )

        # Seller login in a fresh context — must land on /orders (not analytics)
        ctx = browser.new_context()
        seller = ctx.new_page()
        login(seller, 'valentin', '123')
        check('seller login works', '/login' not in seller.url, f'url={seller.url}')
        check(
            'seller lands on /orders (not analytics)',
            '/orders' in seller.url,
            f'url={seller.url}',
        )
        # Soft-check: Logout control visible in sidebar (ASCII-safe via material icon)
        seller.wait_for_selector('.material-icons', timeout=10000)
        logout_visible = seller.locator('.material-icons', has_text='logout').count() > 0
        if logout_visible:
            check('Logout control visible (soft)', True)
        else:
            # Soft: do not fail the suite — log only
            print('[SOFT] Logout control not found (non-blocking)')

        # H5: seller create-order path (after login checks)
        try:
            seller_create_order(seller)
        except Exception as e:
            check('seller create-order lands on /orders/<id>', False, f'err={e}')

        seller.goto(f'{BASE}/orders', wait_until='networkidle')
        check('seller sees own orders', '1111' in seller.content())

        seller.goto(f'{BASE}/', wait_until='networkidle')
        try:
            seller.wait_for_url(re.compile(r'.*/orders/?$'), timeout=10000)
        except Exception:
            pass
        check(
            'seller on / redirects to /orders',
            '/orders' in seller.url and 'Недостаточно прав' not in seller.locator('body').inner_text(),
            seller.url,
        )

        browser.close()

    print(f'\nSmoke UI: {PASS} passed, {FAIL} failed')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
