from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import ProductCard, ProductCategory, Supplier
from clients.models import Client
from orders.models import Order, OrderItem, OrderStatus, SalesChannel
from users.models import User
from warehouse.models import StockItem

ANALYTICS_URL = '/api/v1/analytics/sales/'


def _api_for(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.mark.django_db
def test_seller_cannot_access_analytics():
    seller = User.objects.create_user(
        username='a_seller', email='as@test.com', password='pwd', role='seller'
    )
    response = _api_for(seller).get(ANALYTICS_URL)
    assert response.status_code == 403


@pytest.mark.django_db
def test_manager_dashboard_includes_tz_widgets():
    manager = User.objects.create_user(
        username='a_mgr', email='am@test.com', password='pwd',
        role='manager', first_name='Алексей',
    )
    seller = User.objects.create_user(
        username='a_sel', email='asel@test.com', password='pwd',
        role='seller', first_name='Валентин',
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill X', sku='GX-1', category=category, supplier=supplier,
        base_cost_price=100, min_stock=5,
    )
    StockItem.objects.create(product_card=product, stock_quantity=2)
    channel = SalesChannel.objects.create(name='Сайт')
    today = timezone.now().date()
    order = Order.objects.create(
        order_number=501,
        order_date=today,
        status=Order.Status.COMPLETED,
        seller=seller,
        sales_channel=channel,
        created_by=manager,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1,
        cost_price=Decimal('100'), price=Decimal('200'), vat_rate=Decimal('20'),
    )
    Client.objects.create(first_name='Новый', seller=seller)

    response = _api_for(manager).get(ANALYTICS_URL, {
        'date_from': today.isoformat(),
        'date_to': today.isoformat(),
    })
    assert response.status_code == 200, response.data
    data = response.data
    assert Decimal(str(data['total_revenue'])) == Decimal('240.00')
    assert data['total_completed_orders'] == 1
    assert 'gross_profit' in data
    assert 'margin_percent' in data
    assert 'markup_percent' in data
    assert data['new_clients'] >= 1
    assert data['sales_by_category'][0]['name'] == 'Грили'
    assert data['sales_by_channel'][0]['name'] == 'Сайт'
    assert data['top_sellers'][0]['deals'] == 1
    assert data['low_stock'][0]['sku'] == 'GX-1'
    assert data['sales_by_supplier'][0]['name'] == 'Weber'


@pytest.mark.django_db
def test_analytics_counts_custom_completed_status():
    manager = User.objects.create_user(
        username='a_mgr_custom', email='amc@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='a_sel_custom', email='asc@test.com', password='pwd', role='seller',
    )
    OrderStatus.objects.create(
        code='sold_salon', name='Продано в салоне',
        kind=OrderStatus.Kind.COMPLETED, sort_order=45,
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill Z', sku='GZ-1', category=category, supplier=supplier,
        base_cost_price=100,
    )
    channel = SalesChannel.objects.create(name='Салон')
    today = timezone.now().date()
    order = Order.objects.create(
        order_number=701,
        order_date=today,
        status='sold_salon',
        seller=seller,
        sales_channel=channel,
        created_by=manager,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1,
        cost_price=Decimal('100'), price=Decimal('200'), vat_rate=Decimal('20'),
    )
    response = _api_for(manager).get(ANALYTICS_URL, {
        'date_from': today.isoformat(),
        'date_to': today.isoformat(),
    })
    assert response.status_code == 200, response.data
    assert response.data['total_completed_orders'] == 1
    assert Decimal(str(response.data['total_revenue'])) == Decimal('240.00')


@pytest.mark.django_db
def test_analytics_period_excludes_older_orders():
    manager = User.objects.create_user(
        username='a_mgr2', email='am2@test.com', password='pwd', role='manager'
    )
    seller = User.objects.create_user(
        username='a_sel2', email='asel2@test.com', password='pwd', role='seller'
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill Y', sku='GY-1', category=category, supplier=supplier,
        base_cost_price=50,
    )
    channel = SalesChannel.objects.create(name='Сайт')
    today = timezone.now().date()
    old = Order.objects.create(
        order_number=601,
        order_date=today - timedelta(days=40),
        status=Order.Status.COMPLETED,
        seller=seller,
        sales_channel=channel,
        created_by=manager,
    )
    OrderItem.objects.create(
        order=old, product_card=product, quantity=1,
        cost_price=Decimal('50'), price=Decimal('100'), vat_rate=Decimal('0'),
    )
    response = _api_for(manager).get(ANALYTICS_URL, {
        'date_from': today.isoformat(),
        'date_to': today.isoformat(),
    })
    assert response.status_code == 200
    assert response.data['total_completed_orders'] == 0
    assert Decimal(str(response.data['total_revenue'] or 0)) == Decimal('0')
