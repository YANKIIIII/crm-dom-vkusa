from django.contrib.auth.models import AbstractUser
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

    class Meta:
        db_table = 'user_profiles'


class AuthLock(models.Model):
    username = models.CharField(max_length=150, unique=True)
    failed_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'auth_locks'

