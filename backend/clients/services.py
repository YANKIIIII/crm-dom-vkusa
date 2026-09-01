from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from clients.models import Client, ClientPhone


class ClientService:
    @staticmethod
    def _grill_item(order):
        return next(
            (
                item
                for item in order.items.select_related('product_card__category')
                if item.product_card.category.code == 'A'
            ),
            None,
        )

    @staticmethod
    @transaction.atomic
    def sync_profile_from_order(order):
        """TZ 9.4: update last purchase / category / grill; never touch FIO."""
        client = order.client
        if client is None:
            return None
        items = list(order.items.select_related('product_card__category'))
        if not items:
            return client

        updates = ['last_purchase_date']
        client.last_purchase_date = order.order_date
        first = items[0]
        category_code = first.product_card.category.code or None
        if category_code:
            client.purchase_category = category_code
            updates.append('purchase_category')

        grill_item = next(
            (item for item in items if item.product_card.category.code == 'A'),
            None,
        )
        if grill_item and grill_item.product_card.grill_type:
            client.grill_type = grill_item.product_card.grill_type
            updates.append('grill_type')

        if not client.first_purchase_date:
            client.first_purchase_date = order.order_date
            updates.append('first_purchase_date')

        client.save(update_fields=updates)
        return client

    @staticmethod
    @transaction.atomic
    def recalculate_budget(client):
        """TZ 10.4: sum of completed orders, not incremental +=."""
        from orders.models import Order

        if client is None:
            return
        completed = Order.objects.filter(
            client=client, status=Order.Status.COMPLETED
        ).prefetch_related('items')
        total = sum((order.total_amount for order in completed), Decimal('0.00'))
        client.total_budget = total
        client.save(update_fields=['total_budget'])

    @staticmethod
    @transaction.atomic
    def process_order_client(order, client_data=None):
        """
        Called when an order or its items are saved.
        If the order has no client, creates one when client_data is provided.
        A grill (category code 'A') without a client is rejected so the UI
        can collect name and phone first.
        """
        if order.client:
            return ClientService.sync_profile_from_order(order)

        grill_item = ClientService._grill_item(order)
        has_grill = grill_item is not None

        if not client_data and not has_grill:
            return None

        if has_grill and not client_data:
            raise ValidationError(
                'При продаже гриля укажите клиента (имя и телефон).'
            )

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
        Called when an order is marked as completed or cancelled.
        Recalculates budget from completed orders and syncs profile fields.
        """
        if not order.client:
            return
        if order.status == 'completed':
            ClientService.sync_profile_from_order(order)
        ClientService.recalculate_budget(order.client)
