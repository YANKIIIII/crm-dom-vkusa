"""Quick end-to-end process checks via API + Warehouse UI create product."""
from __future__ import annotations

import re
import sys
import time
import uuid

import requests
from playwright.sync_api import sync_playwright

API = 'http://localhost:8000/api/v1'
UI = 'http://localhost:5173'
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


# Avoid Windows cp1251 crashes on unicode in check names
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def token(user, password):
    r = requests.post(f'{API}/token/', json={'username': user, 'password': password}, timeout=20)
    r.raise_for_status()
    return r.json()['access']


def main():
    # ---- API processes ----
    mgr = {'Authorization': f'Bearer {token("aleksey", "123")}'}
    seller = {'Authorization': f'Bearer {token("valentin", "123")}'}

    cats = requests.get(f'{API}/catalog/product_categories/', headers=mgr, timeout=20).json()
    sups = requests.get(f'{API}/catalog/suppliers/', headers=mgr, timeout=20).json()
    cat_id = (cats.get('results') or cats)[0]['id']
    sup_id = (sups.get('results') or sups)[0]['id']
    sku = f'TEST-{uuid.uuid4().hex[:8]}'

    r = requests.post(
        f'{API}/catalog/product_cards/',
        headers=mgr,
        json={
            'name': f'API Product {sku}',
            'sku': sku,
            'category': cat_id,
            'supplier': sup_id,
            'grill_type': 'gas',
            'rrp': '250',
            'base_cost_price': '100',
        },
        timeout=20,
    )
    check('API create product', r.status_code == 201, f'{r.status_code} {r.text[:180]}')
    product_id = r.json().get('id') if r.status_code == 201 else None

    r = requests.post(
        f'{API}/catalog/product_cards/',
        headers=seller,
        json={
            'name': 'Seller blocked',
            'sku': f'S-{uuid.uuid4().hex[:6]}',
            'category': cat_id,
            'supplier': sup_id,
            'base_cost_price': '10',
        },
        timeout=20,
    )
    check('API seller cannot create product', r.status_code in (403, 401), f'{r.status_code}')

    if product_id:
        stock_resp = requests.get(
            f'{API}/warehouse/stock_items/?product_card={product_id}',
            headers=mgr,
            timeout=20,
        ).json()
        if isinstance(stock_resp, dict) and 'results' in stock_resp:
            stocks = stock_resp['results'] or []
        elif isinstance(stock_resp, list):
            stocks = stock_resp
        else:
            stocks = []
        if stocks:
            item = stocks[0]
            r = requests.patch(
                f'{API}/warehouse/stock_items/{item["id"]}/',
                headers=mgr,
                json={'stock_quantity': int(item['stock_quantity']) + 1},
                timeout=20,
            )
            check('API warehouse qty patch', r.status_code == 200, f'{r.status_code} {r.text[:120]}')
        else:
            r = requests.post(
                f'{API}/warehouse/stock_items/',
                headers=mgr,
                json={'product_card': product_id, 'stock_quantity': 3},
                timeout=20,
            )
            check('API warehouse arrival create', r.status_code == 201, f'{r.status_code} {r.text[:180]}')

    phone = f'+37529{int(time.time()) % 10000000:07d}'
    r = requests.post(
        f'{API}/clients/clients/',
        headers=seller,
        json={'first_name': 'Smoke', 'last_name': 'Client', 'phone': phone},
        timeout=20,
    )
    check('API seller create client+phone', r.status_code == 201 and bool(r.json().get('primary_phone')), f'{r.status_code} {r.text[:160]}')
    client_id = r.json().get('id') if r.status_code == 201 else None

    channels = requests.get(f'{API}/orders/sales_channels/', headers=seller, timeout=20).json()
    ch_id = (channels.get('results') or channels)[0]['id']
    r = requests.post(
        f'{API}/orders/orders/',
        headers=seller,
        json={
            'order_date': time.strftime('%Y-%m-%d'),
            'sales_channel': ch_id,
            'client': client_id,
            'status': 'reserved',
        },
        timeout=20,
    )
    check('API seller create order', r.status_code == 201 and bool(r.json().get('order_number')), f'{r.status_code} {r.text[:160]}')
    order_id = r.json().get('id') if r.status_code == 201 else None

    if order_id and product_id:
        r = requests.post(
            f'{API}/orders/order_items/',
            headers=seller,
            json={
                'order': order_id,
                'product_card': product_id,
                'quantity': 1,
                'price': '80.00',
                'cost_price': '50.00',
                'vat_rate': 20,
            },
            timeout=20,
        )
        check('API add order item', r.status_code == 201, f'{r.status_code} {r.text[:180]}')

        pays = requests.get(f'{API}/orders/payment_types/', headers=seller, timeout=20).json()
        pt = (pays.get('results') or pays)[0]['id']
        r = requests.post(
            f'{API}/orders/order_payments/',
            headers=seller,
            json={'order': order_id, 'payment_type': pt, 'amount': '10.00'},
            timeout=20,
        )
        check('API add payment', r.status_code == 201, f'{r.status_code} {r.text[:160]}')

        r = requests.patch(
            f'{API}/orders/orders/{order_id}/',
            headers=seller,
            json={'status': 'confirmed'},
            timeout=20,
        )
        check('API status reserved to confirmed', r.status_code == 200, f'{r.status_code} {r.text[:120]}')

    # ---- UI create product ----
    ui_sku = f'UI-{uuid.uuid4().hex[:8]}'
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1400, 'height': 900})
        page.goto(f'{UI}/login', wait_until='networkidle')
        page.get_by_label('Логин').fill('aleksey')
        page.get_by_label('Пароль').fill('123')
        page.get_by_role('button', name='Войти').click()
        page.wait_for_url(lambda u: '/login' not in u, timeout=15000)

        page.goto(f'{UI}/warehouse', wait_until='networkidle')
        page.get_by_role('button', name=re.compile(r'НОВЫЙ ТОВАР', re.I)).click()
        page.get_by_label('Наименование').fill(f'UI Product {ui_sku}')
        page.get_by_label('Артикул').fill(ui_sku)

        page.locator('#warehouse-product-category').click()
        page.locator('[role="listbox"] [role="option"]').first.click()
        page.locator('#warehouse-product-supplier').click()
        page.locator('[role="listbox"] [role="option"]').first.click()
        page.locator('#warehouse-product-grill').click()
        page.locator('[role="listbox"] [role="option"]').first.click()

        page.get_by_label('РРЦ (BYN)').fill('199')
        page.get_by_label('Базовая себестоимость (BYN)').fill('80')
        page.get_by_role('button', name='Добавить').click()
        page.wait_for_timeout(2000)

        err = page.locator('.MuiDialog-root [role="alert"]')
        dialog = page.locator('.MuiDialog-root')
        in_list = ui_sku in page.content()
        check(
            'UI create product',
            dialog.count() == 0 and in_list and err.count() == 0,
            f'dialog={dialog.count()} in_list={in_list} alert={err.inner_text()[:120] if err.count() else ""}',
        )
        browser.close()

    print(f'\nProcess check: {PASS} passed, {FAIL} failed')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
