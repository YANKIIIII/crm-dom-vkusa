from django.db import transaction
from clients.models import Client, ClientPhone
from catalog.models import ProductCard
from datetime import date

class ClientService:
    @staticmethod
    @transaction.atomic
    def process_order_client(order, client_data=None):
        """
        Called when an order or its items are saved.
        If the order has no client, creates one when either client_data is
        provided or the order contains a grill (category code 'A') — in the
        latter case the client gets an auto-generated placeholder name.
        """
        if order.client:
            return order.client

        # Check if any order item is a Grill
        grill_item = next(
            (item for item in order.items.all() if item.product_card.category.code == 'A'),
            None
        )
        has_grill = grill_item is not None

        if not client_data and not has_grill:
            return None

        client_data = client_data or {}
        first_name = client_data.get('first_name') or f"Новый Клиент (Заказ #{order.order_number})"

        client = Client.objects.create(
            first_name=first_name,
            last_name=client_data.get('last_name', ''),
            first_purchase_date=order.order_date,
            last_purchase_date=order.order_date,
            purchase_category='A' if has_grill else None,
            grill_type=grill_item.product_card.grill_type if grill_item else None,
            acquisition_source=client_data.get('acquisition_source'),
            seller=order.seller,
        )
        
        phone_number = client_data.get('phone')
        if phone_number:
            ClientPhone.objects.create(
                client=client,
                number=phone_number,
                is_primary=True
            )
            
        order.client = client
        order.save(update_fields=['client'])
        return client

    @staticmethod
    @transaction.atomic
    def update_budget_on_completion(order):
        """
        Called when an order is marked as completed.
        Updates the client's total budget and last purchase date.
        """
        if order.client and order.status == 'completed':
            client = order.client
            client.total_budget += order.total_amount
            client.last_purchase_date = date.today()
            client.save(update_fields=['total_budget', 'last_purchase_date'])
