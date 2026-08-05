import pytest
from datetime import date
from django.utils import timezone
from clients.models import Client
from catalog.models import ProductCard, ProductCategory, Supplier
from orders.models import Order, OrderItem, SalesChannel
from users.models import User
from clients.services import ClientService

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
