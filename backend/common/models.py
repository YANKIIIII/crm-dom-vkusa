from django.db import models
from users.models import User

class AuditLog(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs', verbose_name='Пользователь'
    )
    action = models.CharField(
        max_length=50, verbose_name='Действие'
    ) # CREATE, UPDATE, DELETE, LOGIN, LOGOUT
    entity_type = models.CharField(
        max_length=50, verbose_name='Тип сущности'
    ) # order, order_item, client, product_card, stock_item, user
    entity_id = models.IntegerField(
        verbose_name='ID сущности'
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'audit_logs'

