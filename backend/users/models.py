from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        MANAGER = 'manager', 'Руководитель'
        SELLER = 'seller', 'Сотрудник'

    role = models.CharField(
        max_length=20, choices=Role.choices, default=Role.SELLER, verbose_name='Роль'
    )
    job_title = models.CharField(
        max_length=100, blank=True, verbose_name='Должность'
    )
    modules = models.JSONField(
        default=list, blank=True, verbose_name='Доступы'
    )
    middle_name = models.CharField(
        max_length=100, blank=True, verbose_name='Отчество'
    )

    class Meta:
        db_table = 'users'


class UserProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='profile', verbose_name='Пользователь'
    )
    phone = models.CharField(
        max_length=20, blank=True, verbose_name='Телефон'
    )
    birthday = models.DateField(null=True, blank=True, verbose_name='День рождения')
    notes = models.TextField(blank=True, verbose_name='Заметка')
    hourly_rate = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name='Ставка часа',
    )
    commission_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('3.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name='Процент с продаж',
    )

    class Meta:
        db_table = 'user_profiles'


class AuthLock(models.Model):
    username = models.CharField(max_length=150, unique=True)
    failed_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'auth_locks'
