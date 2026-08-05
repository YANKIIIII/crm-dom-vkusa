from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'user_profiles', views.UserProfileViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
