from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'orders', views.OrderViewSet)
router.register(r'order_items', views.OrderItemViewSet)
router.register(r'order_payments', views.OrderPaymentViewSet)
router.register(r'order_deliveries', views.OrderDeliveryViewSet)
router.register(r'sales_channels', views.SalesChannelViewSet)
router.register(r'payment_types', views.PaymentTypeViewSet)
router.register(r'delivery_services', views.DeliveryServiceViewSet)
router.register(r'order_statuses', views.OrderStatusViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
