import pytest
from django.core.management import call_command
from rest_framework.test import APIClient
from catalog.models import ProductCard, ProductCategory, Supplier
from common.models import AuditLog
from orders.models import DeliveryService, OrderStatus, PaymentType, SalesChannel
from users.models import User
from warehouse.models import StockItem


@pytest.mark.django_db
def test_stock_patch_writes_audit():
    manager = User.objects.create_user(
        username='aud_mgr', email='aud@test.com', password='pwd', role='manager'
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='AUD-1', category=category, supplier=supplier, base_cost_price=10,
    )
    stock = StockItem.objects.create(product_card=product, stock_quantity=4)
    api = APIClient()
    api.force_authenticate(user=manager)
    response = api.patch(f'/api/v1/warehouse/stock_items/{stock.pk}/', {'stock_quantity': 8})
    assert response.status_code == 200, response.data
    assert AuditLog.objects.filter(
        action='UPDATE', entity_type='stock_item', entity_id=stock.pk
    ).exists()


@pytest.mark.django_db
def test_openapi_schema_available_outside_debug():
    manager = User.objects.create_user(
        username='schema_mgr', email='schema@test.com', password='pwd', role='manager',
    )
    api = APIClient()
    denied = api.get('/api/schema/')
    assert denied.status_code in (401, 403)

    api.force_authenticate(user=manager)
    schema = api.get('/api/schema/')
    assert schema.status_code == 200
    docs = api.get('/api/docs/')
    assert docs.status_code == 200


@pytest.mark.django_db
def test_seed_references_creates_tz_dictionaries():
    call_command('seed_references')
    assert ProductCategory.objects.filter(code='A', name='Грили').exists()
    assert ProductCategory.objects.filter(code='F', name='Другое').exists()
    assert SalesChannel.objects.filter(name='Салон (офлайн)').exists()
    assert PaymentType.objects.filter(name='Наличные').exists()
    assert DeliveryService.objects.filter(name='Европочта').exists()
    assert OrderStatus.objects.filter(code='reserved', is_system=True).exists()
    assert OrderStatus.objects.filter(code='completed', kind='completed').exists()


@pytest.mark.django_db
def test_seed_references_is_idempotent():
    call_command('seed_references')
    call_command('seed_references')
    assert ProductCategory.objects.filter(code='A').count() == 1
    assert SalesChannel.objects.filter(name='Сайт').count() == 1
    assert PaymentType.objects.filter(name='Рассрочка').count() == 1
    assert DeliveryService.objects.filter(name='Самовывоз').count() == 1
    assert OrderStatus.objects.filter(code='reserved').count() == 1
