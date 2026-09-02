from django.conf import settings
from django.db import models


class Board(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='task_board',
        verbose_name='Владелец',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'task_boards'


class List(models.Model):
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name='lists', verbose_name='Доска',
    )
    code = models.SlugField(max_length=32, verbose_name='Код')
    name = models.CharField(max_length=100, verbose_name='Наименование')
    sort_order = models.PositiveSmallIntegerField(default=0, verbose_name='Порядок')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'task_lists'
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['board', 'code'], name='uniq_task_list_board_code'),
        ]
        indexes = [
            models.Index(fields=['board'], name='idx_task_lists_board'),
        ]


class Card(models.Model):
    list = models.ForeignKey(
        List, on_delete=models.CASCADE, related_name='cards', verbose_name='Колонка',
    )
    title = models.CharField(max_length=255, verbose_name='Название')
    due_date = models.DateField(null=True, blank=True, verbose_name='Срок')
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='task_cards',
        verbose_name='Заказ',
    )
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='task_cards',
        verbose_name='Клиент',
    )
    position = models.PositiveIntegerField(default=0, verbose_name='Позиция')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_task_cards',
        verbose_name='Автор',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'task_cards'
        ordering = ['position', 'id']
        indexes = [
            models.Index(fields=['list', 'position'], name='idx_task_cards_list_pos'),
        ]
