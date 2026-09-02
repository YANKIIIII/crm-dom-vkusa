from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class MonthEntry(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='personnel_months',
        verbose_name='Сотрудник',
    )
    year = models.PositiveIntegerField(
        validators=[MinValueValidator(2000)],
        verbose_name='Год',
    )
    month = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        verbose_name='Месяц',
    )
    hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name='Часы',
    )
    bonus = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name='Бонус',
    )
    hourly_rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name='Ставка часа',
    )
    commission_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name='Процент с продаж',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personnel_months'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'year', 'month'],
                name='uniq_personnel_month_user',
            ),
        ]
        indexes = [
            models.Index(fields=['year', 'month'], name='idx_personnel_months_ym'),
        ]


class Leave(models.Model):
    class Kind(models.TextChoices):
        VACATION = 'vacation', 'Отпуск'
        TIME_OFF = 'time_off', 'Отгул'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='personnel_leaves',
        verbose_name='Сотрудник',
    )
    kind = models.CharField(
        max_length=16, choices=Kind.choices, verbose_name='Тип',
    )
    date_from = models.DateField(verbose_name='С')
    date_to = models.DateField(verbose_name='По')
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_personnel_leaves',
        verbose_name='Автор',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personnel_leaves'
        indexes = [
            models.Index(fields=['user'], name='idx_personnel_leaves_user'),
            models.Index(fields=['date_from', 'date_to'], name='idx_personnel_leaves_range'),
        ]
