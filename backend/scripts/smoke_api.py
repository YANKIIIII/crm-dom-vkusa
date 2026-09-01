"""API smoke checklist against a running local stack (http://localhost:8000)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date

BASE = 'http://localhost:8000/api/v1'
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


def req(method, path, token=None, body=None, expect=200):
    global PASS, FAIL
    data = None if body is None else json.dumps(body).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = urllib.request.Request(f'{BASE}{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            status = resp.status
            payload = resp.read().decode()
    except urllib.error.HTTPError as e:
        status = e.code
        payload = e.read().decode()
    ok = status == expect
    mark = 'OK' if ok else 'FAIL'
    if ok:
        PASS += 1
    else:
        FAIL += 1
    print(f'[{mark}] {method} {path} -> {status} (expect {expect})')
    if not ok and payload:
        print(f'       body: {payload[:200]}')
    try:
        return status, json.loads(payload) if payload else None
    except json.JSONDecodeError:
        return status, payload


def main():
    _, mgr = req('POST', '/token/', body={'username': 'aleksey', 'password': '123'}, expect=200)
    mgr_token = mgr['access']
    _, sel = req('POST', '/token/', body={'username': 'valentin', 'password': '123'}, expect=200)
    sel_token = sel['access']

    req('GET', '/orders/orders/', expect=401)
    _, orders = req('GET', '/orders/orders/', token=mgr_token, expect=200)
    assert orders['count'] >= 1
    first = orders['results'][0]
    print(f'       first order_number={first["order_number"]} (newest first)')

    req('GET', '/orders/orders/?search=Weber', token=mgr_token, expect=200)
    req('GET', '/analytics/sales/', token=mgr_token, expect=200)
    req('GET', '/analytics/sales/', token=sel_token, expect=403)
    req('GET', '/common/audit_logs/', token=sel_token, expect=403)

    _, stock = req('GET', '/warehouse/stock_items/', token=sel_token, expect=200)
    stock_id = stock['results'][0]['id']
    qty = stock['results'][0]['stock_quantity']
    req('PATCH', f'/warehouse/stock_items/{stock_id}/', token=sel_token,
        body={'stock_quantity': qty}, expect=200)

    # reserved -> confirmed for order 1111
    o1111 = next(o for o in orders['results'] if o['order_number'] == 1111)
    o1045 = next(o for o in orders['results'] if o['order_number'] == 1045)
    req('PATCH', f'/orders/orders/{o1045["id"]}/', token=sel_token,
        body={'status': 'reserved'}, expect=400)
    req('PATCH', f'/orders/orders/{o1111["id"]}/', token=sel_token,
        body={'status': 'confirmed'}, expect=200)

    # Phase A: auto order_number on create (seller)
    _, channels = req('GET', '/orders/sales_channels/', token=sel_token, expect=200)
    if isinstance(channels, dict) and 'results' in channels:
        channel_id = channels['results'][0]['id']
    else:
        channel_id = channels[0]['id']
    status, created_order = req(
        'POST', '/orders/orders/', token=sel_token,
        body={'order_date': date.today().isoformat(), 'sales_channel': channel_id},
        expect=201,
    )
    check(
        'created order has order_number',
        status == 201 and created_order and created_order.get('order_number') is not None,
        f'body={created_order}',
    )
    if status == 201 and created_order and created_order.get('order_number') is not None:
        print(f'       created order_number={created_order["order_number"]}')

    # Phase A: client create with phone (seller)
    status, created_client = req(
        'POST', '/clients/clients/', token=sel_token,
        body={'first_name': 'Smoke', 'last_name': 'Phone', 'phone': '+375291112233'},
        expect=201,
    )
    check(
        'client primary_phone set',
        status == 201 and created_client and created_client.get('primary_phone') == '+375291112233',
        f'body={created_client}',
    )

    # Phase A: total_budget is read-only
    if status == 201 and created_client:
        budget_before = created_client.get('total_budget')
        _, patched = req(
            'PATCH', f'/clients/clients/{created_client["id"]}/', token=sel_token,
            body={'total_budget': '99999.00'},
            expect=200,
        )
        budget_after = patched.get('total_budget') if patched else None
        unchanged = (
            budget_after is not None
            and float(budget_after) == float(budget_before or 0)
            and float(budget_after) != 99999.0
        )
        check(
            'total_budget unchanged after PATCH 99999',
            unchanged,
            f'before={budget_before} after={budget_after}',
        )
    else:
        check('total_budget unchanged after PATCH 99999', False, 'skipped — client create failed')

    # CORS preflight
    request = urllib.request.Request(
        f'{BASE}/token/',
        method='OPTIONS',
        headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
        },
    )
    with urllib.request.urlopen(request, timeout=10) as resp:
        origin = resp.headers.get('Access-Control-Allow-Origin')
        check('CORS Allow-Origin', origin == 'http://localhost:5173', f'got={origin}')

    print(f'\nSmoke API: {PASS} passed, {FAIL} failed')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
