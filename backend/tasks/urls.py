from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'boards', views.BoardViewSet, basename='task-board')
router.register(r'cards', views.CardViewSet, basename='task-card')

urlpatterns = [
    path('', include(router.urls)),
]
