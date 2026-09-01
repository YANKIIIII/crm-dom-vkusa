from django.db import transaction
from rest_framework.exceptions import ValidationError
from common.audit import write_audit
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
    def _require_available(stock_item, quantity, product_missing_ok=False):
        if stock_item is None:
            if product_missing_ok:
                return
            raise ValidationError('Товар отсутствует на складе.')
        if stock_item.stock_quantity < quantity:
            raise ValidationError(
                f'Недостаточно товара на складе. '
                f'Доступно: {stock_item.stock_quantity} шт., запрошено: {quantity} шт.'
            )

    @staticmethod
    @transaction.atomic
    def assert_stock_available(item):
        """Validate shelf qty without changing it (reservation does not deduct)."""
        stock_item = WarehouseService._locked_stock(item.product_card)
        WarehouseService._require_available(stock_item, item.quantity)

    @staticmethod
    @transaction.atomic
    def reserve_stock_for_item(item):
        """Back-compat alias: check only, do not deduct."""
        WarehouseService.assert_stock_available(item)

    @staticmethod
    @transaction.atomic
    def deduct_stock_for_item(item):
        stock_item = WarehouseService._locked_stock(item.product_card)
        WarehouseService._require_available(stock_item, item.quantity)
        stock_item.stock_quantity -= item.quantity
        stock_item.save(update_fields=['stock_quantity', 'stock_tag'])
        write_audit(
            None,
            'SYSTEM',
            'stock_item',
            stock_item.pk,
            details={
                'event': 'stock_deducted',
                'order_id': item.order_id,
                'quantity': item.quantity,
                'stock_quantity': stock_item.stock_quantity,
            },
        )

    @staticmethod
    @transaction.atomic
    def deduct_items(order):
        for item in order.items.all():
            WarehouseService.deduct_stock_for_item(item)

    @staticmethod
    @transaction.atomic
    def update_stock_for_item_change(item, old_quantity, new_quantity):
        if old_quantity == new_quantity:
            return
        WarehouseService.assert_stock_available(item)

    @staticmethod
    @transaction.atomic
    def update_stock_for_item_update(item, old_product_card, old_quantity):
        WarehouseService.assert_stock_available(item)

    @staticmethod
    @transaction.atomic
    def release_stock_for_item(item):
        return

    @staticmethod
    @transaction.atomic
    def release_stock(product_card, quantity):
        return

    @staticmethod
    @transaction.atomic
    def release_items(order):
        return
