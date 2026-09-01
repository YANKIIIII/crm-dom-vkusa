from django.core.management.base import BaseCommand
from catalog.models import ProductCategory
from orders.models import DeliveryService, PaymentType, SalesChannel

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


class Command(BaseCommand):
    help = 'Идемпотентно создать справочники категорий, каналов, оплат и доставки.'

    def handle(self, *args, **options):
        for code, name in CATEGORIES:
            ProductCategory.objects.get_or_create(code=code, defaults={'name': name})
        for name in CHANNELS:
            SalesChannel.objects.get_or_create(name=name)
        for name in PAYMENTS:
            PaymentType.objects.get_or_create(name=name)
        for name in DELIVERIES:
            DeliveryService.objects.get_or_create(name=name)
        self.stdout.write(self.style.SUCCESS('Справочники готовы.'))
