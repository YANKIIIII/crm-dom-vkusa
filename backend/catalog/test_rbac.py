import pytest
from rest_framework.test import APIClient
from catalog.models import ProductCard, ProductCategory, Supplier
from warehouse.models import StockItem
from users.models import User

PRODUCT_CARDS_URL = '/api/v1/catalog/product_cards/'
STOCK_ITEMS_URL = '/api/v1/warehouse/stock_items/'
SUPPLIERS_URL = '/api/v1/catalog/suppliers/'


def _make_product(sku='G-01'):
    category = ProductCategory.objects.create(name='Grills', code='A')
    supplier = Supplier.objects.create(name='Supplier X')
    return ProductCard.objects.create(
        name='Test Grill', sku=sku, category=category, supplier=supplier, base_cost_price=100
    )


def _api_for(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.mark.django_db
def test_seller_can_create_and_edit_supplier():
    seller = User.objects.create_user(username='seller_sup', email='ssup@test.com', password='pwd', role='seller')
    api = _api_for(seller)

    created = api.post(SUPPLIERS_URL, {'name': 'Weber'})
    assert created.status_code == 201, created.data
    supplier_id = created.data['id']

    patched = api.patch(f'{SUPPLIERS_URL}{supplier_id}/', {'phone': '+375290000000'})
    assert patched.status_code == 200, patched.data
    assert patched.data['phone'] == '+375290000000'


@pytest.mark.django_db
def test_post_supplier_reuses_existing_by_name_and_phone():
    seller = User.objects.create_user(username='seller_sup2', email='ss2@test.com', password='pwd', role='seller')
    existing = Supplier.objects.create(name='Weber', phone='')
    api = _api_for(seller)

    by_name = api.post(SUPPLIERS_URL, {'name': 'weber', 'phone': '+375291111111'})
    assert by_name.status_code == 200, by_name.data
    assert by_name.data['id'] == existing.pk
    assert Supplier.objects.filter(name__iexact='Weber').count() == 1
    existing.refresh_from_db()
    assert existing.phone == '+375291111111'

    by_phone = api.post(SUPPLIERS_URL, {'name': 'Weber Sp. z o.o.', 'phone': '+375291111111'})
    assert by_phone.status_code == 200, by_phone.data
    assert by_phone.data['id'] == existing.pk
    assert Supplier.objects.count() == 1


@pytest.mark.django_db
def test_seller_can_read_and_edit_product_cards():
    seller = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    product = _make_product()
    api = _api_for(seller)

    response = api.get(PRODUCT_CARDS_URL)
    assert response.status_code == 200

    response = api.patch(f'{PRODUCT_CARDS_URL}{product.pk}/', {'base_cost_price': 1})
    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.base_cost_price == 1


@pytest.mark.django_db
def test_manager_can_edit_product_cards():
    manager = User.objects.create_user(username='manager1', email='m1@test.com', password='pwd', role='manager')
    product = _make_product()
    api = _api_for(manager)

    response = api.patch(f'{PRODUCT_CARDS_URL}{product.pk}/', {'base_cost_price': 200})
    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.base_cost_price == 200


@pytest.mark.django_db
def test_seller_can_read_and_edit_stock_items():
    seller = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    product = _make_product(sku='G-02')
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    api = _api_for(seller)

    response = api.get(STOCK_ITEMS_URL)
    assert response.status_code == 200

    response = api.patch(f'{STOCK_ITEMS_URL}{stock.pk}/', {'stock_quantity': 9999})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 9999


@pytest.mark.django_db
def test_manager_can_edit_stock_items():
    manager = User.objects.create_user(username='manager2', email='m2@test.com', password='pwd', role='manager')
    product = _make_product(sku='G-03')
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    api = _api_for(manager)

    response = api.patch(f'{STOCK_ITEMS_URL}{stock.pk}/', {'stock_quantity': 25})
    assert response.status_code == 200, response.data
    stock.refresh_from_db()
    assert stock.stock_quantity == 25


@pytest.mark.django_db
def test_seller_can_delete_stock_item():
    seller = User.objects.create_user(username='seller_del', email='sdel@test.com', password='pwd', role='seller')
    product = _make_product(sku='G-DEL')
    stock = StockItem.objects.create(product_card=product, stock_quantity=4)
    api = _api_for(seller)

    response = api.delete(f'{STOCK_ITEMS_URL}{stock.pk}/')
    assert response.status_code == 204
    assert not StockItem.objects.filter(pk=stock.pk).exists()
    assert ProductCard.objects.filter(pk=product.pk).exists()


@pytest.mark.django_db
def test_product_cards_filter_by_rrp_max():
    from decimal import Decimal

    manager = User.objects.create_user(
        username='pc_price', email='pcp@test.com', password='pwd', role='manager',
    )
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    cheap = ProductCard.objects.create(
        name='Cheap', sku='CH-1', category=category, supplier=supplier,
        base_cost_price=50, rrp=Decimal('100.00'),
    )
    pricey = ProductCard.objects.create(
        name='Pricey', sku='PR-1', category=category, supplier=supplier,
        base_cost_price=200, rrp=Decimal('500.00'),
    )
    api = _api_for(manager)
    response = api.get(PRODUCT_CARDS_URL, {'rrp_max': '200'})
    assert response.status_code == 200, response.data
    ids = [row['id'] for row in response.data['results']]
    assert cheap.pk in ids
    assert pricey.pk not in ids
