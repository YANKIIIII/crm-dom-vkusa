from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from catalog.models import ProductCard, ProductCategory, Supplier
from orders.models import Order, OrderItem, SalesChannel
from personnel.models import Leave, MonthEntry
from personnel.services import (
    compute_pay,
    ensure_profile,
    leaves_intersecting_month,
    month_bounds,
    sales_total_for,
)
from users.models import User, UserProfile

MINSK = ZoneInfo('Europe/Minsk')


def _seller(**kwargs):
    defaults = dict(
        username='pay_sel', email='paysel@test.com', password='pwd', role='seller',
    )
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


def _completed_order(seller, completed_at, price=Decimal('200'), qty=1, **kwargs):
    channel, _ = SalesChannel.objects.get_or_create(name='Pay Channel')
    category, _ = ProductCategory.objects.get_or_create(name='Pay Cat', defaults={'code': 'P'})
    supplier, _ = Supplier.objects.get_or_create(name='Pay Sup')
    product = ProductCard.objects.create(
        name='Pay Grill', sku=f'PAY-{uuid4().hex}',
        category=category, supplier=supplier, base_cost_price=100,
    )
    order = Order.objects.create(
        order_date=completed_at.date(),
        status=Order.Status.COMPLETED,
        seller=seller,
        sales_channel=channel,
        created_by=seller,
        completed_at=completed_at,
        **kwargs,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=qty,
        cost_price=Decimal('100'), price=price, vat_rate=Decimal('20'),
    )
    return order


@pytest.mark.django_db
def test_create_user_makes_profile_with_default_commission():
    user = _seller()
    profile = UserProfile.objects.get(user=user)
    assert profile.commission_percent == Decimal('3.00')
    assert profile.hourly_rate == Decimal('0.00')
    assert profile.phone == ''
    assert profile.birthday is None
    assert profile.notes == ''


@pytest.mark.django_db
def test_compute_pay_hours_percent_bonus():
    total = compute_pay(
        hours=Decimal('168'),
        hourly_rate=Decimal('500'),
        commission_percent=Decimal('3'),
        sales_total=Decimal('1000000'),
        bonus=Decimal('5000'),
    )
    assert total == Decimal('119000.00')


@pytest.mark.django_db
def test_sales_only_completed_in_minsk_month():
    seller = _seller()
    other = _seller(username='pay_oth', email='payoth@test.com')
    sept = datetime(2026, 9, 10, 12, 0, tzinfo=MINSK)
    aug = datetime(2026, 8, 31, 23, 0, tzinfo=MINSK)
    _completed_order(seller, sept)  # 200 * 1.2 = 240
    _completed_order(seller, aug)
    cancelled = _completed_order(seller, sept, price=Decimal('500'))
    cancelled.status = Order.Status.CANCELLED
    cancelled.save(update_fields=['status'])
    open_order = _completed_order(seller, sept, price=Decimal('300'))
    open_order.status = Order.Status.RESERVED
    open_order.completed_at = None
    open_order.save(update_fields=['status', 'completed_at'])
    _completed_order(other, sept)
    assert sales_total_for(seller, 2026, 9) == Decimal('240.00')


@pytest.mark.django_db
def test_without_month_entry_hours_zero_rate_from_profile():
    seller = _seller()
    profile = ensure_profile(seller)
    profile.hourly_rate = Decimal('500')
    profile.commission_percent = Decimal('3')
    profile.save()
    sept = datetime(2026, 9, 10, 12, 0, tzinfo=MINSK)
    _completed_order(seller, sept)
    assert MonthEntry.objects.filter(user=seller, year=2026, month=9).exists() is False
    sales = sales_total_for(seller, 2026, 9)
    pay = compute_pay(
        hours=Decimal('0'),
        hourly_rate=profile.hourly_rate,
        commission_percent=profile.commission_percent,
        sales_total=sales,
        bonus=Decimal('0'),
    )
    assert pay == Decimal('7.20')  # 3% of 240


@pytest.mark.django_db
def test_saved_month_ignores_later_profile_rate_change():
    seller = _seller()
    profile = ensure_profile(seller)
    profile.hourly_rate = Decimal('500')
    profile.commission_percent = Decimal('3')
    profile.save()
    MonthEntry.objects.create(
        user=seller, year=2026, month=9,
        hours=Decimal('10'), bonus=Decimal('0'),
        hourly_rate=Decimal('500'), commission_percent=Decimal('3'),
    )
    profile.hourly_rate = Decimal('999')
    profile.save(update_fields=['hourly_rate'])
    row = MonthEntry.objects.get(user=seller, year=2026, month=9)
    assert row.hourly_rate == Decimal('500')
    pay = compute_pay(
        hours=row.hours, hourly_rate=row.hourly_rate,
        commission_percent=row.commission_percent,
        sales_total=Decimal('0'), bonus=row.bonus,
    )
    assert pay == Decimal('5000.00')


@pytest.mark.django_db
def test_leave_spans_month_boundary():
    seller = _seller()
    Leave.objects.create(
        user=seller, kind=Leave.Kind.VACATION,
        date_from=date(2026, 8, 25), date_to=date(2026, 9, 5),
    )
    aug = leaves_intersecting_month(2026, 8)
    sept = leaves_intersecting_month(2026, 9)
    assert aug.filter(user=seller).exists()
    assert sept.filter(user=seller).exists()
    assert not leaves_intersecting_month(2026, 7).filter(user=seller).exists()


@pytest.mark.django_db
def test_month_bounds_are_minsk():
    start, end = month_bounds(2026, 9)
    assert start.tzinfo is not None
    assert start == datetime(2026, 9, 1, 0, 0, tzinfo=MINSK)
    assert end == datetime(2026, 10, 1, 0, 0, tzinfo=MINSK)
