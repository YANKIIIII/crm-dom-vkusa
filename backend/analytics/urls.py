from django.urls import path
from . import views

urlpatterns = [
    path('sales/', views.SalesAnalyticsView.as_view(), name='sales-analytics'),
]
