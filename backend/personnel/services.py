from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Sum

from analytics.views import LINE_REVENUE
from orders.models import OrderItem, completed_order_status_codes
from personnel.models import Leave, MonthEntry
from users.models import UserProfile

MINSK = ZoneInfo('Europe/Minsk')
PAY_QUANTIZE = Decimal('0.01')


def ensure_profile(user):
    profile, _created = UserProfile.objects.get_or_create(user=user)
    return profile


def month_bounds(year, month):
    start = datetime(year, month, 1, 0, 0, tzinfo=MINSK)
    if month == 12:
        end = datetime(year + 1, 1, 1, 0, 0, tzinfo=MINSK)
    else:
        end = datetime(year, month + 1, 1, 0, 0, tzinfo=MINSK)
    return start, end


def compute_pay(hours, hourly_rate, commission_percent, sales_total, bonus):
    total = (
        hours * hourly_rate
        + (commission_percent / Decimal('100')) * sales_total
        + bonus
    )
    return total.quantize(PAY_QUANTIZE)


def sales_total_for(user, year, month):
    start, end = month_bounds(year, month)
    total = (
        OrderItem.objects.filter(
            order__status__in=completed_order_status_codes(),
            order__seller=user,
            order__completed_at__gte=start,
            order__completed_at__lt=end,
        ).aggregate(revenue=Sum(LINE_REVENUE))['revenue']
    )
    if total is None:
        return Decimal('0.00')
    return total.quantize(PAY_QUANTIZE)


def effective_month(user, year, month):
    profile = ensure_profile(user)
    row = MonthEntry.objects.filter(user=user, year=year, month=month).first()
    if row is None:
        return {
            'year': year,
            'month': month,
            'hours': Decimal('0.00'),
            'bonus': Decimal('0.00'),
            'hourly_rate': profile.hourly_rate,
            'commission_percent': profile.commission_percent,
            'rate_source': 'profile',
        }
    return {
        'year': year,
        'month': month,
        'hours': row.hours,
        'bonus': row.bonus,
        'hourly_rate': row.hourly_rate,
        'commission_percent': row.commission_percent,
        'rate_source': 'month',
    }


def month_with_pay(user, year, month):
    data = dict(effective_month(user, year, month))
    sales = sales_total_for(user, year, month)
    data['sales_total'] = sales
    data['pay_total'] = compute_pay(
        hours=data['hours'],
        hourly_rate=data['hourly_rate'],
        commission_percent=data['commission_percent'],
        sales_total=sales,
        bonus=data['bonus'],
    )
    return data


def leaves_intersecting_month(year, month):
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return Leave.objects.filter(date_from__lte=last, date_to__gte=first)
