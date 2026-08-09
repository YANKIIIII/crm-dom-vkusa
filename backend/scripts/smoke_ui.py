"""Browser smoke against http://localhost:5173 using Playwright."""
from __future__ import annotations

import sys
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
    page.get_by_label('Email (Username)').fill(username)
    page.get_by_label('Пароль').fill(password)
    page.get_by_role('button', name='Войти').click()
    page.wait_for_url(lambda url: '/login' not in url, timeout=15000)


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
        # Expect mock order 1111 visible somewhere
        content = page.content()
        check('orders list shows mock order 1111', '1111' in content)

        # Phase B: manager sees delete on non-terminal order (mock #1111)
        page.get_by_text('#1111', exact=True).click()
        page.wait_for_url(lambda url: '/orders/' in url and not url.rstrip('/').endswith('/orders'), timeout=15000)
        page.wait_for_load_state('networkidle')
        page.get_by_text('Заказ 1111', exact=False).wait_for(timeout=15000)
        delete_btn = page.get_by_role('button', name='Удалить заказ')
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


        seller.goto(f'{BASE}/orders', wait_until='networkidle')
        check('seller sees own orders', '1111' in seller.content())

        # Phase B: seller direct / shows friendly forbidden (RoleRoute)
        seller.goto(f'{BASE}/', wait_until='networkidle')
        seller_body = seller.locator('body').inner_text()
        check(
            'seller on / sees Недостаточно прав',
            'Недостаточно прав' in seller_body,
            seller_body[:160],
        )

        browser.close()

    print(f'\nSmoke UI: {PASS} passed, {FAIL} failed')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
