from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal

class ProductCategory(models.Model):
    code = models.CharField(max_length=10, unique=True, verbose_name='Код') # A, B, C, D, E
    name = models.CharField(max_length=100, verbose_name='Наименование')

    class Meta:
        db_table = 'product_categories'

class Supplier(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name='Наименование')
    contact_person = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')
    phone = models.CharField(max_length=20, blank=True, verbose_name='Телефон')
    email = models.EmailField(null=True, blank=True, verbose_name='Email')
    comment = models.TextField(null=True, blank=True, verbose_name='Комментарий')
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'suppliers'

class ProductCard(models.Model):
    class GrillType(models.TextChoices):
        CHARCOAL = 'charcoal', 'Угольный'
        GAS = 'gas', 'Газовый'
        CERAMIC = 'ceramic', 'Керамический'
        ELECTRIC = 'electric', 'Электрический'
        PELLET = 'pellet', 'Пеллетный'

    name = models.CharField(max_length=255, verbose_name='Наименование')
    sku = models.CharField(max_length=50, unique=True, verbose_name='Артикул')
    category = models.ForeignKey(
        ProductCategory, on_delete=models.RESTRICT, related_name='products', verbose_name='Категория'
    )
    rrp = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal('0.00'))], verbose_name='РРЦ'
    )
    base_cost_price = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))], verbose_name='Базовая себестоимость'
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.RESTRICT, related_name='products', verbose_name='Поставщик'
    )
    dimensions = models.CharField(
        max_length=100, blank=True, verbose_name='Габариты (ШxВxГ)'
    )
    weight = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, verbose_name='Вес (кг)'
    )
    min_stock = models.PositiveIntegerField(
        default=0, verbose_name='Мин. остаток'
    )
    grill_type = models.CharField(
        max_length=20, choices=GrillType.choices, null=True, blank=True, verbose_name='Тип гриля'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'product_cards'
        indexes = [
            models.Index(fields=['category'], name='idx_products_category'),
            models.Index(fields=['sku'], name='idx_products_sku'),
        ]

