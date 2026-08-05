from django.db import models
from catalog.models import ProductCard

class StockItem(models.Model):
    product_card = models.ForeignKey(
        ProductCard, on_delete=models.RESTRICT, related_name='stock_items', verbose_name='Карточка товара'
    )
    stock_quantity = models.PositiveIntegerField(
        default=0, verbose_name='Остаток'
    )
    expiry_date = models.DateField(
        null=True, blank=True, verbose_name='Срок годности'
    )
    stock_tag = models.CharField(
        max_length=50, null=True, blank=True, verbose_name='Тег'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'stock_items'
        indexes = [
            models.Index(fields=['stock_tag'], name='idx_stock_tag'),
        ]

    def save(self, *args, **kwargs):
        min_stock = self.product_card.min_stock
        if self.stock_quantity == 0:
            self.stock_tag = "Нет в наличии"
        elif self.stock_quantity < min_stock:
            self.stock_tag = "Товар заканчивается"
        else:
            self.stock_tag = None
        super().save(*args, **kwargs)

