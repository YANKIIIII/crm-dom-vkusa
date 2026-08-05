from django.core.management.base import BaseCommand
from django.conf import settings
from users.models import User, UserProfile
from catalog.models import ProductCategory, Supplier, ProductCard
from warehouse.models import StockItem
from clients.models import Client, ClientPhone
from orders.models import SalesChannel, PaymentType, DeliveryService, Order, OrderItem, OrderPayment
from common.models import AuditLog
from decimal import Decimal

class Command(BaseCommand):
    help = 'Load mock data for local development'

    def handle(self, *args, **kwargs):
        if not settings.DEBUG:
            self.stdout.write(self.style.ERROR('Данная команда доступна только в режиме DEBUG=True.'))
            return

        self.stdout.write("Clearing old data...")
        # AuditLog.user is RESTRICT — clear logs before deleting users.
        AuditLog.objects.all().delete()
        OrderPayment.objects.all().delete()
        OrderItem.objects.all().delete()
        Order.objects.all().delete()
        ClientPhone.objects.all().delete()
        Client.objects.all().delete()
        StockItem.objects.all().delete()
        ProductCard.objects.all().delete()
        Supplier.objects.all().delete()
        ProductCategory.objects.all().delete()
        DeliveryService.objects.all().delete()
        PaymentType.objects.all().delete()
        SalesChannel.objects.all().delete()
        UserProfile.objects.all().delete()
        User.objects.exclude(username='admin').delete()

        self.stdout.write("Creating users...")
        u1 = User.objects.create_user(username='valentin', password='123', first_name='Валентин', last_name='Менеджер', role='seller')
        UserProfile.objects.create(user=u1, phone='+375291112233')
        
        u2 = User.objects.create_user(username='aleksey', password='123', first_name='Алексей', last_name='Смирнов', role='manager')
        UserProfile.objects.create(user=u2, phone='+375291112244')

        self.stdout.write("Creating dictionaries...")
        cat_grill = ProductCategory.objects.create(name='Грили', code='A')
        cat_acc = ProductCategory.objects.create(name='Аксессуары', code='B')
        
        sup = Supplier.objects.create(name='ООО ГрильИмпорт', contact_person='Игорь', email='import@grill.by')
        
        sc_site = SalesChannel.objects.create(name='Сайт')
        sc_inst = SalesChannel.objects.create(name='Инстаграм')
        
        pt_cash = PaymentType.objects.create(name='Наличные')
        pt_card = PaymentType.objects.create(name='Оплата картой / ЕРИП')
        
        ds_pickup = DeliveryService.objects.create(name='Самовывоз')
        ds_courier = DeliveryService.objects.create(name='Курьер')

        self.stdout.write("Creating products...")
        p1 = ProductCard.objects.create(sku='WEB-310', name='Гриль Weber Genesis II E-310', category=cat_grill, supplier=sup, base_cost_price=Decimal('4500.00'), grill_type='gas')
        p2 = ProductCard.objects.create(sku='NAP-57', name='Угольный гриль Napoleon Kettle 57', category=cat_grill, supplier=sup, base_cost_price=Decimal('1800.00'), grill_type='charcoal')
        p3 = ProductCard.objects.create(sku='ACC-8835', name='Чугунная решётка GBS Weber', category=cat_acc, supplier=sup, base_cost_price=Decimal('350.00'))
        
        StockItem.objects.create(product_card=p1, stock_quantity=8)
        StockItem.objects.create(product_card=p2, stock_quantity=14)
        StockItem.objects.create(product_card=p3, stock_quantity=25)

        self.stdout.write("Creating clients...")
        c1 = Client.objects.create(first_name='Иван', last_name='Сидоров', email='ivan@mail.ru', discount_percent=Decimal('15.00'), total_budget=Decimal('15000.00'), seller=u1)
        ClientPhone.objects.create(client=c1, number='+375 (29) 543-12-89', is_primary=True)
        
        c2 = Client.objects.create(first_name='Анна', last_name='Иванова', email='anna@gmail.com', discount_percent=Decimal('0.00'), total_budget=Decimal('0.00'), seller=u1)
        ClientPhone.objects.create(client=c2, number='+375 (44) 111-22-33', is_primary=True)

        self.stdout.write("Creating orders...")
        o1 = Order.objects.create(
            order_number=1045,
            client=c1,
            seller=u1,
            created_by=u2,
            sales_channel=sc_site,
            delivery_service=ds_courier,
            status='cancelled',
            order_date='2026-07-10',
            comment='Отменен клиентом.'
        )
        
        o2 = Order.objects.create(
            order_number=1111,
            client=c1,
            seller=u1,
            created_by=u1,
            sales_channel=sc_inst,
            delivery_service=ds_courier,
            status='reserved',
            order_date='2026-07-23',
            comment='Доставить до двери'
        )
        OrderItem.objects.create(order=o2, product_card=p1, cost_price=Decimal('4500.00'), price=Decimal('6500.00'), vat_rate=Decimal('20.00'), quantity=2)
        OrderPayment.objects.create(order=o2, payment_type=pt_cash, amount=Decimal('15000.00'))

        self.stdout.write(self.style.SUCCESS("Data loading complete!"))
