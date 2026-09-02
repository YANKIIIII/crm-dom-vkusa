from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

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
