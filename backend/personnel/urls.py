from django.urls import path, re_path

from personnel import views

urlpatterns = [
    path('employees/', views.EmployeeListView.as_view()),
    path('employees/<int:pk>/', views.EmployeeDetailView.as_view()),
    re_path(
        r'^employees/(?P<pk>[0-9]+)/months/(?P<year>[0-9]{4})-(?P<month>0?[1-9]|1[0-2])/$',
        views.EmployeeMonthView.as_view(),
    ),
]
