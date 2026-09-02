from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal


class Client(models.Model):
    first_name = models.CharField(max_length=100, verbose_name='Имя')
    last_name = models.CharField(max_length=100, blank=True, verbose_name='Фамилия')
    middle_name = models.CharField(max_length=100, blank=True, verbose_name='Отчество')
    email = models.EmailField(null=True, blank=True, unique=True, verbose_name='Email')
    birth_date = models.DateField(null=True, blank=True, verbose_name='Дата рождения')
    address = models.TextField(null=True, blank=True, verbose_name='Адрес')
    purchase_category = models.CharField(max_length=10, null=True, blank=True, verbose_name='Категория покупки')
    first_purchase_date = models.DateField(null=True, blank=True, verbose_name='Дата первой покупки')
    last_purchase_date = models.DateField(null=True, blank=True, verbose_name='Дата последней покупки')
    grill_type = models.CharField(
        max_length=32, null=True, blank=True, verbose_name='Тип гриля'
    )
    total_budget = models.DecimalField(
        max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0.00'))], verbose_name='Общий бюджет'
    )
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))], verbose_name='Скидка (%)'
    )
    preferred_contact = models.CharField(max_length=50, null=True, blank=True, verbose_name='Предпочитаемый контакт')
    acquisition_source = models.CharField(max_length=100, null=True, blank=True, verbose_name='Источник привлечения')
    comment = models.TextField(null=True, blank=True, verbose_name='Комментарий')
    seller = models.ForeignKey(
        'users.User', on_delete=models.RESTRICT, related_name='clients', null=True, blank=True, verbose_name='Продавец'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'clients'
        indexes = [
            models.Index(fields=['last_name'], name='idx_clients_last_name'),
            models.Index(fields=['purchase_category'], name='idx_clients_purchase_cat'),
        ]

class ClientPhone(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='phones', verbose_name='Клиент')
    number = models.CharField(max_length=20, verbose_name='Номер телефона')
    comment = models.CharField(max_length=255, blank=True, verbose_name='Комментарий')
    is_primary = models.BooleanField(default=False, verbose_name='Основной')

    class Meta:
        db_table = 'client_phones'

