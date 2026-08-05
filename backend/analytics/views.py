from rest_framework.views import APIView
from rest_framework.response import Response
from common.permissions import IsManager
from orders.models import Order, OrderItem
from django.db.models import Count, Sum, F, ExpressionWrapper, DecimalField
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from collections import defaultdict

# Выручка позиции с НДС и скидкой заказа; Decimal-литералы, чтобы не смешивать
# численные типы в выражении (price/vat_rate/discount_percent — DecimalField).
LINE_REVENUE = ExpressionWrapper(
    F('price')
    * (Decimal('1') + F('vat_rate') / Decimal('100'))
    * F('quantity')
    * (Decimal('1') - F('order__discount_percent') / Decimal('100')),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)

class SalesAnalyticsView(APIView):
    permission_classes = [IsManager]

    def get(self, request):
        # 1. Total revenue and completed orders count
        completed_orders = Order.objects.filter(status=Order.Status.COMPLETED)
        
        total_revenue_agg = OrderItem.objects.filter(
            order__status=Order.Status.COMPLETED
        ).aggregate(total=Sum(LINE_REVENUE))
        total_revenue = total_revenue_agg['total'] or 0
        
        # 2. Orders by status
        orders_by_status_qs = Order.objects.values('status').annotate(count=Count('id'))
        status_map = {choice[0]: choice[1] for choice in Order.Status.choices}
        orders_by_status = [
            {
                "status_code": item['status'],
                "name": status_map.get(item['status'], item['status']),
                "count": item['count']
            }
            for item in orders_by_status_qs
        ]

        # 3. Popular items
        popular_items_qs = OrderItem.objects.filter(
            order__status=Order.Status.COMPLETED
        ).values('product_card__name').annotate(
            total_sold=Sum('quantity')
        ).order_by('-total_sold')[:5]

        popular_items = [
            {"name": item['product_card__name'], "total_sold": item['total_sold']}
            for item in popular_items_qs
        ]
        
        # 4. Daily revenue (Last 30 days)
        thirty_days_ago = timezone.now().date() - timedelta(days=30)
        
        daily_revenue_qs = OrderItem.objects.filter(
            order__status=Order.Status.COMPLETED,
            order__order_date__gte=thirty_days_ago
        ).values('order__order_date').annotate(
            revenue=Sum(LINE_REVENUE)
        ).order_by('order__order_date')

        daily_revenue = [
            {"date": item['order__order_date'].strftime('%Y-%m-%d'), "revenue": item['revenue']}
            for item in daily_revenue_qs
        ]

        return Response({
            "total_revenue": total_revenue,
            "total_completed_orders": completed_orders.count(),
            "orders_by_status": orders_by_status,
            "popular_items": popular_items,
            "daily_revenue": daily_revenue
        })
