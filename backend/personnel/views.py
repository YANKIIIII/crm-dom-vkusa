from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import write_audit
from common.permissions import HasModule
from personnel.models import MonthEntry
from personnel.serializers import (
    EmployeeProfileSerializer,
    LeaveReadSerializer,
    MonthWriteSerializer,
)
from personnel.services import (
    MINSK,
    ensure_profile,
    leaves_intersecting_month,
    month_with_pay,
)
from users.models import User


def parse_year_month(request):
    now = timezone.now().astimezone(MINSK)
    year = now.year
    month = now.month
    year_raw = request.query_params.get('year')
    month_raw = request.query_params.get('month')
    if year_raw not in (None, ''):
        try:
            year = int(year_raw)
        except (TypeError, ValueError):
            raise ValidationError({'year': 'Укажите год числом.'})
    if month_raw not in (None, ''):
        try:
            month = int(month_raw)
        except (TypeError, ValueError):
            raise ValidationError({'month': 'Укажите месяц числом.'})
    if month < 1 or month > 12:
        raise ValidationError({'month': 'Месяц должен быть от 1 до 12.'})
    if year < 2000:
        raise ValidationError({'year': 'Год должен быть не меньше 2000.'})
    return year, month


def employee_list_item(user, year, month):
    month_data = month_with_pay(user, year, month)
    return {
        'id': user.pk,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'job_title': user.job_title,
        'role': user.role,
        'is_active': user.is_active,
        'hours': month_data['hours'],
        'bonus': month_data['bonus'],
        'hourly_rate': month_data['hourly_rate'],
        'commission_percent': month_data['commission_percent'],
        'sales_total': month_data['sales_total'],
        'pay_total': month_data['pay_total'],
        'rate_source': month_data['rate_source'],
    }


def employee_detail_payload(user, year, month):
    profile = ensure_profile(user)
    leaves = leaves_intersecting_month(year, month).filter(user=user).order_by('date_from', 'id')
    return {
        'id': user.pk,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'job_title': user.job_title,
        'role': user.role,
        'is_active': user.is_active,
        'phone': profile.phone,
        'birthday': profile.birthday,
        'notes': profile.notes,
        'hourly_rate': profile.hourly_rate,
        'commission_percent': profile.commission_percent,
        'month': month_with_pay(user, year, month),
        'leaves': LeaveReadSerializer(leaves, many=True).data,
    }


class EmployeeListView(APIView):
    permission_classes = [HasModule('personnel')]

    def get(self, request):
        year, month = parse_year_month(request)
        users = User.objects.order_by('-is_active', 'last_name', 'first_name', 'id')
        return Response([employee_list_item(user, year, month) for user in users])


class EmployeeDetailView(APIView):
    permission_classes = [HasModule('personnel')]

    def get(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        year, month = parse_year_month(request)
        return Response(employee_detail_payload(user, year, month))

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        profile = ensure_profile(user)
        serializer = EmployeeProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        write_audit(request.user, 'UPDATE', 'personnel_profile', profile.pk)
        year, month = parse_year_month(request)
        return Response(employee_detail_payload(user, year, month))


class EmployeeMonthView(APIView):
    permission_classes = [HasModule('personnel')]

    def put(self, request, pk, year, month):
        user = get_object_or_404(User, pk=pk)
        try:
            year = int(year)
            month = int(month)
        except (TypeError, ValueError):
            raise ValidationError({'month': 'Некорректный месяц.'})
        if month < 1 or month > 12:
            raise ValidationError({'month': 'Месяц должен быть от 1 до 12.'})
        if year < 2000:
            raise ValidationError({'year': 'Год должен быть не меньше 2000.'})
        serializer = MonthWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        profile = ensure_profile(user)
        row = MonthEntry.objects.filter(user=user, year=year, month=month).first()
        created = row is None
        if created:
            row = MonthEntry(
                user=user,
                year=year,
                month=month,
                hours=data['hours'],
                bonus=data['bonus'],
                hourly_rate=data.get('hourly_rate', profile.hourly_rate),
                commission_percent=data.get(
                    'commission_percent', profile.commission_percent,
                ),
            )
        else:
            row.hours = data['hours']
            row.bonus = data['bonus']
            if 'hourly_rate' in data:
                row.hourly_rate = data['hourly_rate']
            if 'commission_percent' in data:
                row.commission_percent = data['commission_percent']
        row.save()
        write_audit(
            request.user,
            'CREATE' if created else 'UPDATE',
            'personnel_month',
            row.pk,
        )
        return Response(month_with_pay(user, year, month))
