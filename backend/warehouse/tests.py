import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from warehouse.services import WarehouseService
from warehouse.models import StockItem
from orders.models import Order, OrderItem, SalesChannel
from catalog.models import ProductCard, ProductCategory, Supplier
from users.models import User

@pytest.mark.django_db
def test_stock_deduction_on_order_item_creation():
    user = User.objects.create_user(username='testuser', email='test@test.com', password='pwd', role='manager', first_name='Test')
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Grill", sku="G-01", category=category, supplier=supplier, base_cost_price=100)
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    channel = SalesChannel.objects.create(name="Website")
    
    order = Order.objects.create(
        order_number=1,
        order_date=timezone.now().date(),
        status=Order.Status.RESERVED,
        seller=user,
        sales_channel=channel,
        created_by=user
    )

    item = OrderItem(
        order=order,
        product_card=product,
        quantity=3,
        cost_price=100,
        price=150,
        vat_rate=20
    )

    WarehouseService.reserve_stock_for_item(item)

    stock.refresh_from_db()
    assert stock.stock_quantity == 10

    WarehouseService.deduct_stock_for_item(item)
    stock.refresh_from_db()
    assert stock.stock_quantity == 7

@pytest.mark.django_db
def test_stock_item_save_updates_tag():
    category = ProductCategory.objects.create(name="Grills")
    supplier = Supplier.objects.create(name="Supplier X")
    product = ProductCard.objects.create(name="Test Tag Grill", sku="G-02", category=category, supplier=supplier, base_cost_price=100, min_stock=5)
    
    stock = StockItem.objects.create(product_card=product, stock_quantity=10)
    assert stock.stock_tag is None

    stock.stock_quantity = 3
    stock.save()
    assert stock.stock_tag == "Товар заканчивается"

    stock.stock_quantity = 0
    stock.save()
    assert stock.stock_tag == "Нет в наличии"

    stock.stock_quantity = 6
    stock.save()
    assert stock.stock_tag is None


def _setup_order_env(sku_suffix=""):
    """Create the common user/category/supplier/channel/order fixtures."""
    user = User.objects.create_user(
        username=f'testuser{sku_suffix}', email=f'test{sku_suffix}@test.com',
        password='pwd', role='manager', first_name='Test'
    )
    category = ProductCategory.objects.create(name=f"Grills{sku_suffix}")
    supplier = Supplier.objects.create(name=f"Supplier{sku_suffix}")
    channel = SalesChannel.objects.create(name=f"Website{sku_suffix}")
    order = Order.objects.create(
        order_number=100,
        order_date=timezone.now().date(),
        status=Order.Status.RESERVED,
        seller=user,
        sales_channel=channel,
        created_by=user,
    )
    return user, category, supplier, order


@pytest.mark.django_db
def test_reserve_without_stock_item_raises_validation_error():
    _, category, supplier, order = _setup_order_env("-ns")
    product = ProductCard.objects.create(
        name="No Stock Grill", sku="G-NS-01", category=category,
        supplier=supplier, base_cost_price=100
    )

    item = OrderItem(
        order=order,
        product_card=product,
        quantity=1,
        cost_price=100,
        price=150,
        vat_rate=20,
    )

    with pytest.raises(ValidationError) as exc_info:
        WarehouseService.reserve_stock_for_item(item)
    assert "Товар отсутствует на складе." in str(exc_info.value)


@pytest.mark.django_db
def test_update_stock_for_item_update_product_swap():
    _, category, supplier, order = _setup_order_env("-swap")
    product_a = ProductCard.objects.create(
        name="Grill A", sku="G-SW-A", category=category,
        supplier=supplier, base_cost_price=100
    )
    product_b = ProductCard.objects.create(
        name="Grill B", sku="G-SW-B", category=category,
        supplier=supplier, base_cost_price=100
    )
    stock_a = StockItem.objects.create(product_card=product_a, stock_quantity=10)
    stock_b = StockItem.objects.create(product_card=product_b, stock_quantity=10)

    item = OrderItem.objects.create(
        order=order,
        product_card=product_a,
        quantity=3,
        cost_price=100,
        price=150,
        vat_rate=20,
    )
    WarehouseService.reserve_stock_for_item(item)
    stock_a.refresh_from_db()
    assert stock_a.stock_quantity == 10

    item.product_card = product_b
    item.quantity = 4
    item.save()

    WarehouseService.update_stock_for_item_update(
        item, old_product_card=product_a, old_quantity=3
    )

    stock_a.refresh_from_db()
    stock_b.refresh_from_db()
    assert stock_a.stock_quantity == 10
    assert stock_b.stock_quantity == 10


@pytest.mark.django_db
def test_stock_list_filters_category_tag_and_expiry():
    from datetime import date
    from rest_framework.test import APIClient

    user = User.objects.create_user(username='wh_f', email='whf@test.com', password='pwd', role='manager')
    cat_a = ProductCategory.objects.create(name='Грили', code='A')
    cat_c = ProductCategory.objects.create(name='Топливо', code='C')
    supplier = Supplier.objects.create(name='FilterSup')
    grill = ProductCard.objects.create(
        name='Grill F', sku='F-A', category=cat_a, supplier=supplier, base_cost_price=10, min_stock=5,
    )
    fuel = ProductCard.objects.create(
        name='Pellets F', sku='F-C', category=cat_c, supplier=supplier, base_cost_price=1, min_stock=20,
    )
    low = StockItem.objects.create(product_card=grill, stock_quantity=2, expiry_date=date(2026, 1, 10))
    plenty = StockItem.objects.create(product_card=fuel, stock_quantity=50, expiry_date=date(2026, 8, 20))

    api = APIClient()
    api.force_authenticate(user=user)

    by_cat = api.get('/api/v1/warehouse/stock_items/', {'category': cat_a.pk})
    assert by_cat.status_code == 200
    ids = [row['id'] for row in by_cat.data['results']]
    assert low.pk in ids
    assert plenty.pk not in ids

    by_tag = api.get('/api/v1/warehouse/stock_items/', {'stock_tag': 'Товар заканчивается'})
    assert by_tag.status_code == 200
    tag_ids = [row['id'] for row in by_tag.data['results']]
    assert low.pk in tag_ids
    assert plenty.pk not in tag_ids

    by_expiry = api.get('/api/v1/warehouse/stock_items/', {
        'expiry_after': '2026-08-01',
        'expiry_before': '2026-08-31',
    })
    assert by_expiry.status_code == 200
    exp_ids = [row['id'] for row in by_expiry.data['results']]
    assert plenty.pk in exp_ids
    assert low.pk not in exp_ids

    by_qty = api.get('/api/v1/warehouse/stock_items/', {'stock_min': 10, 'stock_max': 60})
    assert by_qty.status_code == 200
    qty_ids = [row['id'] for row in by_qty.data['results']]
    assert plenty.pk in qty_ids
    assert low.pk not in qty_ids

    by_cat_name = api.get('/api/v1/warehouse/stock_items/', {'ordering': '-product_card__category__name'})
    assert by_cat_name.status_code == 200
    names = [row['category_name'] for row in by_cat_name.data['results']]
    assert names == ['Топливо', 'Грили']


@pytest.mark.django_db
def test_post_stock_increments_existing_row():
    from rest_framework.test import APIClient

    user = User.objects.create_user(username='wh_inc', email='whinc@test.com', password='pwd', role='seller')
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='IncSup')
    product = ProductCard.objects.create(
        name='Grill Inc', sku='INC-1', category=category, supplier=supplier, base_cost_price=10,
    )
    stock = StockItem.objects.create(product_card=product, stock_quantity=5)
    api = APIClient()
    api.force_authenticate(user=user)

    response = api.post('/api/v1/warehouse/stock_items/', {
        'product_card': product.pk,
        'stock_quantity': 3,
    })
    assert response.status_code == 200, response.data
    assert response.data['id'] == stock.pk
    assert response.data['stock_quantity'] == 8
    assert StockItem.objects.filter(product_card=product).count() == 1
    stock.refresh_from_db()
    assert stock.stock_quantity == 8
