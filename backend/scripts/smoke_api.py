"""API smoke checklist against a running local stack (http://localhost:8000)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = 'http://localhost:8000/api/v1'
PASS = 0
FAIL = 0


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
    req('PATCH', f'/warehouse/stock_items/{stock_id}/', token=sel_token,
        body={'stock_quantity': 999}, expect=403)

    # reserved -> confirmed for order 1111
    o1111 = next(o for o in orders['results'] if o['order_number'] == 1111)
    o1045 = next(o for o in orders['results'] if o['order_number'] == 1045)
    req('PATCH', f'/orders/orders/{o1045["id"]}/', token=sel_token,
        body={'status': 'reserved'}, expect=400)
    req('PATCH', f'/orders/orders/{o1111["id"]}/', token=sel_token,
        body={'status': 'confirmed'}, expect=200)

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
        ok = origin == 'http://localhost:5173'
        global PASS, FAIL
        if ok:
            PASS += 1
            print(f'[OK] CORS Allow-Origin={origin}')
        else:
            FAIL += 1
            print(f'[FAIL] CORS Allow-Origin={origin}')

    print(f'\nSmoke API: {PASS} passed, {FAIL} failed')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
