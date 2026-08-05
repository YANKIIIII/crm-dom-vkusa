import pytest
from rest_framework.test import APIClient
from catalog.models import ProductCard, ProductCategory, Supplier
from warehouse.models import StockItem
from users.models import User

PRODUCT_CARDS_URL = '/api/v1/catalog/product_cards/'
STOCK_ITEMS_URL = '/api/v1/warehouse/stock_items/'


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
def test_seller_can_read_but_not_edit_product_cards():
    seller = User.objects.create_user(username='seller1', email='s1@test.com', password='pwd', role='seller')
    product = _make_product()
    api = _api_for(seller)

    response = api.get(PRODUCT_CARDS_URL)
    assert response.status_code == 200

    response = api.patch(f'{PRODUCT_CARDS_URL}{product.pk}/', {'base_cost_price': 1})
    assert response.status_code == 403
    product.refresh_from_db()
    assert product.base_cost_price == 100


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
def test_seller_can_read_but_not_edit_stock_items():
    seller = User.objects.create_user(username='seller2', email='s2@test.com', password='pwd', role='seller')
    product = _make_product(sku='G-02')
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    api = _api_for(seller)

    response = api.get(STOCK_ITEMS_URL)
    assert response.status_code == 200

    response = api.patch(f'{STOCK_ITEMS_URL}{stock.pk}/', {'stock_quantity': 9999})
    assert response.status_code == 403
    stock.refresh_from_db()
    assert stock.stock_quantity == 10


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
