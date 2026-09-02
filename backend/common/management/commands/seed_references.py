from django.core.management.base import BaseCommand
from catalog.models import ProductCategory
from orders.models import DeliveryService, OrderStatus, PaymentType, SalesChannel

CATEGORIES = [
    ('A', 'Грили'),
    ('B', 'Аксессуары'),
    ('C', 'Расходные материалы и топливо'),
    ('D', 'Соусы и специи'),
    ('E', 'Посуда'),
    ('F', 'Другое'),
]
CHANNELS = [
    'Салон (офлайн)', 'Сайт', 'Маркетплейс', 'Телефон',
    'Социальные сети', 'Рекомендация', 'Прочее',
]
PAYMENTS = [
    'Наличные',
    'Безналичный расчёт (без НДС)',
    'Безналичный расчёт (с НДС)',
    'Перевод на карту',
    'Рассрочка',
]
DELIVERIES = ['Самовывоз', 'Курьер', 'Европочта']
ORDER_STATUSES = [
    ('reserved', 'Резерв', OrderStatus.Kind.OPEN, 10),
    ('confirmed', 'Подтвержден', OrderStatus.Kind.OPEN, 20),
    ('in_delivery', 'В доставке', OrderStatus.Kind.OPEN, 30),
    ('completed', 'Завершен', OrderStatus.Kind.COMPLETED, 40),
    ('cancelled', 'Отменен', OrderStatus.Kind.CANCELLED, 50),
]


class Command(BaseCommand):
    help = 'Идемпотентно создать справочники категорий, каналов, оплат, доставки и статусов.'

    def handle(self, *args, **options):
        for code, name in CATEGORIES:
            ProductCategory.objects.get_or_create(code=code, defaults={'name': name})
        for name in CHANNELS:
            SalesChannel.objects.get_or_create(name=name)
        for name in PAYMENTS:
            PaymentType.objects.get_or_create(name=name)
        for name in DELIVERIES:
            DeliveryService.objects.get_or_create(name=name)
        for code, name, kind, sort_order in ORDER_STATUSES:
            OrderStatus.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'kind': kind,
                    'sort_order': sort_order,
                    'is_system': True,
                },
            )
        self.stdout.write(self.style.SUCCESS('Справочники готовы.'))
