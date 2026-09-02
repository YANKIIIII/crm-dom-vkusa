from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import HasModule
from orders.models import Order, OrderItem, status_label, completed_order_status_codes
from warehouse.models import StockItem
from clients.models import Client

# Выручка позиции с НДС и скидкой заказа; Decimal-литералы, чтобы не смешивать
# численные типы в выражении (price/vat_rate/discount_percent — DecimalField).
LINE_REVENUE = ExpressionWrapper(
    F('price')
    * (Decimal('1') + F('vat_rate') / Decimal('100'))
    * F('quantity')
    * (Decimal('1') - F('order__discount_percent') / Decimal('100')),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)

LINE_COST = ExpressionWrapper(
    F('cost_price') * F('quantity'),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)


def _parse_date(value, field):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({field: 'Ожидается дата в формате YYYY-MM-DD.'})


class SalesAnalyticsView(APIView):
    permission_classes = [HasModule('analytics')]

    def get(self, request):
        date_from = _parse_date(request.query_params.get('date_from'), 'date_from')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')
        if date_from and date_to and date_from > date_to:
            raise ValidationError({'date_from': 'date_from не может быть позже date_to.'})

        completed_codes = completed_order_status_codes()
        completed_orders = Order.objects.filter(status__in=completed_codes)
        completed_items = OrderItem.objects.filter(order__status__in=completed_codes)
        if date_from:
            completed_orders = completed_orders.filter(order_date__gte=date_from)
            completed_items = completed_items.filter(order__order_date__gte=date_from)
        if date_to:
            completed_orders = completed_orders.filter(order_date__lte=date_to)
            completed_items = completed_items.filter(order__order_date__lte=date_to)

        totals = completed_items.aggregate(
            revenue=Sum(LINE_REVENUE),
            cost=Sum(LINE_COST),
        )
        total_revenue = totals['revenue'] or Decimal('0')
        total_cost = totals['cost'] or Decimal('0')
        gross_profit = total_revenue - total_cost
        completed_count = completed_orders.count()
        average_check = (
            (total_revenue / completed_count) if completed_count else Decimal('0')
        )
        margin_percent = (
            (gross_profit / total_revenue * Decimal('100')) if total_revenue else Decimal('0')
        )
        markup_percent = (
            (gross_profit / total_cost * Decimal('100')) if total_cost else Decimal('0')
        )

        orders_by_status = [
            {
                'status_code': item['status'],
                'name': status_label(item['status']),
                'count': item['count'],
            }
            for item in Order.objects.values('status').annotate(count=Count('id'))
        ]

        popular_items = [
            {'name': item['product_card__name'], 'total_sold': item['total_sold']}
            for item in completed_items.values('product_card__name')
            .annotate(total_sold=Sum('quantity'))
            .order_by('-total_sold')[:5]
        ]

        thirty_days_ago = timezone.now().date() - timedelta(days=30)
        daily_source = completed_items
        if not date_from and not date_to:
            daily_source = daily_source.filter(order__order_date__gte=thirty_days_ago)
        daily_revenue = [
            {
                'date': item['order__order_date'].strftime('%Y-%m-%d'),
                'revenue': item['revenue'],
            }
            for item in daily_source.values('order__order_date')
            .annotate(revenue=Sum(LINE_REVENUE))
            .order_by('order__order_date')
        ]

        qty_by_category = {
            row['product_card__category__name']: row['quantity']
            for row in completed_items.values('product_card__category__name').annotate(
                quantity=Sum('quantity')
            )
        }
        qty_by_supplier = {
            row['product_card__supplier__name']: row['quantity']
            for row in completed_items.values('product_card__supplier__name').annotate(
                quantity=Sum('quantity')
            )
        }
        sales_by_category = [
            {
                'name': item['product_card__category__name'] or 'Без категории',
                'quantity': qty_by_category.get(item['product_card__category__name']) or 0,
                'revenue': item['revenue'] or Decimal('0'),
            }
            for item in completed_items.values('product_card__category__name')
            .annotate(revenue=Sum(LINE_REVENUE))
            .order_by('-revenue')
        ]

        sales_by_channel = [
            {
                'name': item['order__sales_channel__name'] or 'Без канала',
                'count': item['count'],
                'revenue': item['revenue'] or Decimal('0'),
            }
            for item in completed_items.values('order__sales_channel__name')
            .annotate(count=Count('order', distinct=True), revenue=Sum(LINE_REVENUE))
            .order_by('-revenue')
        ]

        top_sellers = [
            {
                'seller_id': item['order__seller_id'],
                'name': (
                    f"{item['order__seller__first_name'] or ''} "
                    f"{item['order__seller__last_name'] or ''}"
                ).strip()
                or item['order__seller__username'],
                'deals': item['deals'],
                'revenue': item['revenue'] or Decimal('0'),
                'gross_profit': (item['revenue'] or Decimal('0')) - (item['cost'] or Decimal('0')),
            }
            for item in completed_items.values(
                'order__seller_id',
                'order__seller__first_name',
                'order__seller__last_name',
                'order__seller__username',
            )
            .annotate(
                deals=Count('order', distinct=True),
                revenue=Sum(LINE_REVENUE),
                cost=Sum(LINE_COST),
            )
            .order_by('-revenue')
        ]

        sales_by_supplier = [
            {
                'name': item['product_card__supplier__name'] or 'Без поставщика',
                'quantity': qty_by_supplier.get(item['product_card__supplier__name']) or 0,
                'revenue': item['revenue'] or Decimal('0'),
                'cost': item['cost'] or Decimal('0'),
                'gross_profit': (item['revenue'] or Decimal('0')) - (item['cost'] or Decimal('0')),
                'markup_percent': (
                    ((item['revenue'] or Decimal('0')) - (item['cost'] or Decimal('0')))
                    / item['cost']
                    * Decimal('100')
                    if item['cost']
                    else Decimal('0')
                ),
            }
            for item in completed_items.values('product_card__supplier__name')
            .annotate(
                revenue=Sum(LINE_REVENUE),
                cost=Sum(LINE_COST),
            )
            .order_by('-revenue')
        ]

        low_stock = [
            {
                'id': row.id,
                'sku': row.product_card.sku,
                'name': row.product_card.name,
                'stock_quantity': row.stock_quantity,
                'min_stock': row.product_card.min_stock,
            }
            for row in StockItem.objects.select_related('product_card')
            .filter(stock_tag='Товар заканчивается')
            .order_by('stock_quantity', 'id')[:20]
        ]

        new_clients_qs = Client.objects.all()
        if date_from:
            new_clients_qs = new_clients_qs.filter(created_at__date__gte=date_from)
        if date_to:
            new_clients_qs = new_clients_qs.filter(created_at__date__lte=date_to)
        elif not date_from:
            new_clients_qs = new_clients_qs.filter(created_at__date__gte=thirty_days_ago)

        return Response({
            'total_revenue': total_revenue,
            'total_completed_orders': completed_count,
            'average_check': average_check,
            'gross_profit': gross_profit,
            'margin_percent': margin_percent,
            'markup_percent': markup_percent,
            'new_clients': new_clients_qs.count(),
            'orders_by_status': orders_by_status,
            'popular_items': popular_items,
            'daily_revenue': daily_revenue,
            'sales_by_category': sales_by_category,
            'sales_by_channel': sales_by_channel,
            'top_sellers': top_sellers,
            'low_stock': low_stock,
            'sales_by_supplier': sales_by_supplier,
            'date_from': date_from.isoformat() if date_from else None,
            'date_to': date_to.isoformat() if date_to else None,
        })
