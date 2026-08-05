from django.db import transaction
from rest_framework.exceptions import ValidationError
from warehouse.models import StockItem


class WarehouseService:
    @staticmethod
    def _locked_stock(product_card):
        """Fetch the StockItem row with a row-level lock (select_for_update).

        Must be called inside an active transaction. Returns None when the
        product has no stock record.
        """
        return (
            StockItem.objects.select_for_update()
            .filter(product_card=product_card)
            .first()
        )

    @staticmethod
    @transaction.atomic
    def reserve_items(order):
        """Called when an order is created/items are added to reserve stock."""
        for item in order.items.all():
            WarehouseService.reserve_stock_for_item(item)

    @staticmethod
    @transaction.atomic
    def reserve_stock_for_item(item):
        stock_item = WarehouseService._locked_stock(item.product_card)
        if stock_item is None:
            raise ValidationError("Товар отсутствует на складе.")
        if stock_item.stock_quantity < item.quantity:
            raise ValidationError(
                f"Недостаточно товара на складе. "
                f"Доступно: {stock_item.stock_quantity} шт., запрошено: {item.quantity} шт."
            )
        stock_item.stock_quantity -= item.quantity
        stock_item.save(update_fields=['stock_quantity', 'stock_tag'])

    @staticmethod
    @transaction.atomic
    def update_stock_for_item_change(item, old_quantity, new_quantity):
        """Adjust stock when an order item quantity changes."""
        if old_quantity == new_quantity:
            return
        stock_item = WarehouseService._locked_stock(item.product_card)
        delta = new_quantity - old_quantity
        if stock_item is None:
            if delta > 0:
                raise ValidationError("Товар отсутствует на складе.")
            # Releasing stock for a product with no record is harmless.
            return
        if delta > 0 and stock_item.stock_quantity < delta:
            raise ValidationError(
                f"Недостаточно товара на складе. "
                f"Требуется еще {delta}, доступно {stock_item.stock_quantity}."
            )
        stock_item.stock_quantity -= delta
        stock_item.save(update_fields=['stock_quantity', 'stock_tag'])

    @staticmethod
    @transaction.atomic
    def update_stock_for_item_update(item, old_product_card, old_quantity):
        """Adjust stock after an order item update, handling product change.

        If the product was swapped, the old product's reservation is fully
        released and the new product is reserved from scratch.
        """
        if item.product_card_id != old_product_card.pk:
            WarehouseService.release_stock(old_product_card, old_quantity)
            WarehouseService.reserve_stock_for_item(item)
        else:
            WarehouseService.update_stock_for_item_change(
                item, old_quantity, item.quantity
            )

    @staticmethod
    @transaction.atomic
    def release_stock_for_item(item):
        """Return reserved stock when an order item is removed."""
        WarehouseService.release_stock(item.product_card, item.quantity)

    @staticmethod
    @transaction.atomic
    def release_stock(product_card, quantity):
        stock_item = WarehouseService._locked_stock(product_card)
        if stock_item:
            stock_item.stock_quantity += quantity
            stock_item.save(update_fields=['stock_quantity', 'stock_tag'])

    @staticmethod
    @transaction.atomic
    def release_items(order):
        """Called when an order is cancelled to release reserved stock."""
        for item in order.items.all():
            WarehouseService.release_stock(item.product_card, item.quantity)
