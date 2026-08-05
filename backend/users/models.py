from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        MANAGER = 'manager', 'Руководитель'
        SELLER = 'seller', 'Продавец'

    role = models.CharField(
        max_length=20, choices=Role.choices, default=Role.SELLER, verbose_name='Роль'
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

    class Meta:
        db_table = 'user_profiles'

