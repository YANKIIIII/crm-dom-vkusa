from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'clients', views.ClientViewSet)
router.register(r'client_phones', views.ClientPhoneViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
