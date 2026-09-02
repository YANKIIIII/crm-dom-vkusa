from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'product_categories', views.ProductCategoryViewSet)
router.register(r'suppliers', views.SupplierViewSet)
router.register(r'product_cards', views.ProductCardViewSet)
router.register(r'grill_types', views.GrillTypeViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
