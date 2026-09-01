import pytest
from datetime import date
from django.utils import timezone
from clients.models import Client
from catalog.models import ProductCard, ProductCategory, Supplier
from orders.models import Order, OrderItem, SalesChannel
from users.models import User
from clients.services import ClientService
from decimal import Decimal

@pytest.mark.django_db
def test_update_budget_on_completion():
    user = User.objects.create_user(username='testuser', email='test@test.com', password='pwd', role='manager', first_name='Test')
    client = Client.objects.create(first_name='Test Client', total_budget=0)
    channel = SalesChannel.objects.create(name="Website")
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category, supplier=supplier, base_cost_price=100)
    
    order = Order.objects.create(
        order_number=1,
        order_date=timezone.now().date(),
        status=Order.Status.RESERVED,
        seller=user,
        sales_channel=channel,
        created_by=user,
        client=client
    )

    OrderItem.objects.create(
        order=order, product_card=product, quantity=2, cost_price=100, price=200, vat_rate=20
    ) # 2 * 200 * 1.2 = 480

    # Act
    order.status = Order.Status.COMPLETED
    order.save()

    # Assert
    client.refresh_from_db()
    assert float(client.total_budget) == 480.0
    assert client.last_purchase_date == date.today()


@pytest.mark.django_db
def test_repurchase_updates_category_and_grill_not_fio():
    user = User.objects.create_user(username='rep', email='rep@test.com', password='pwd', role='manager')
    client = Client.objects.create(
        first_name='Иван', last_name='Петров', purchase_category='B',
        first_purchase_date=date(2024, 1, 1),
    )
    channel = SalesChannel.objects.create(name='Сайт')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-R1', category=category, supplier=supplier,
        base_cost_price=100, grill_type='gas',
    )
    order = Order.objects.create(
        order_number=40, order_date=timezone.now().date(),
        status=Order.Status.RESERVED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1, cost_price=100, price=200, vat_rate=20,
    )
    ClientService.sync_profile_from_order(order)
    client.refresh_from_db()
    assert client.first_name == 'Иван'
    assert client.last_name == 'Петров'
    assert client.first_purchase_date == date(2024, 1, 1)
    assert client.purchase_category == 'A'
    assert client.grill_type == 'gas'
    assert client.last_purchase_date == order.order_date


@pytest.mark.django_db
def test_budget_recalculate_does_not_double_count():
    user = User.objects.create_user(username='bud', email='bud@test.com', password='pwd', role='manager')
    client = Client.objects.create(first_name='Клиент')
    channel = SalesChannel.objects.create(name='Сайт')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    product = ProductCard.objects.create(
        name='Grill', sku='G-B1', category=category, supplier=supplier, base_cost_price=50,
    )
    order = Order.objects.create(
        order_number=41, order_date=timezone.now().date(),
        status=Order.Status.COMPLETED, seller=user, sales_channel=channel,
        created_by=user, client=client,
    )
    OrderItem.objects.create(
        order=order, product_card=product, quantity=1, cost_price=50, price=100, vat_rate=0,
    )
    ClientService.recalculate_budget(client)
    ClientService.recalculate_budget(client)
    client.refresh_from_db()
    assert client.total_budget == Decimal('100.00')


@pytest.mark.django_db
def test_client_list_filters_discount_and_last_purchase():
    from rest_framework.test import APIClient

    manager = User.objects.create_user(username='cl_f', email='clf@test.com', password='pwd', role='manager')
    cheap = Client.objects.create(
        first_name='Cheap', seller=manager, discount_percent=Decimal('5.00'),
        last_purchase_date=date(2026, 1, 10),
    )
    pricey = Client.objects.create(
        first_name='Pricey', seller=manager, discount_percent=Decimal('20.00'),
        last_purchase_date=date(2026, 8, 12),
    )

    api = APIClient()
    api.force_authenticate(user=manager)

    by_discount = api.get('/api/v1/clients/clients/', {'discount_min': 10, 'discount_max': 30})
    assert by_discount.status_code == 200
    ids = [row['id'] for row in by_discount.data['results']]
    assert pricey.pk in ids
    assert cheap.pk not in ids

    by_date = api.get('/api/v1/clients/clients/', {
        'last_purchase_after': '2026-08-01',
        'last_purchase_before': '2026-08-31',
    })
    assert by_date.status_code == 200
    date_ids = [row['id'] for row in by_date.data['results']]
    assert pricey.pk in date_ids
    assert cheap.pk not in date_ids


@pytest.mark.django_db
def test_seller_can_create_client_with_phone_and_edit_any_client_phone():
    from rest_framework.test import APIClient
    from clients.models import ClientPhone

    seller1 = User.objects.create_user(username='ph_s1', email='phs1@test.com', password='pwd', role='seller')
    seller2 = User.objects.create_user(username='ph_s2', email='phs2@test.com', password='pwd', role='seller')
    foreign = Client.objects.create(first_name='Чужой', seller=seller2)
    phone = ClientPhone.objects.create(client=foreign, number='+375290000001', is_primary=True)

    api = APIClient()
    api.force_authenticate(user=seller1)

    created = api.post('/api/v1/clients/clients/', {
        'first_name': 'Новый',
        'last_name': 'Клиент',
        'phone': '+375291234567',
    })
    assert created.status_code == 201, created.data
    assert created.data['primary_phone'] == '+375291234567'

    patched = api.patch(f'/api/v1/clients/client_phones/{phone.pk}/', {
        'number': '+375299999999',
    })
    assert patched.status_code == 200, patched.data
    phone.refresh_from_db()
    assert phone.number == '+375299999999'
