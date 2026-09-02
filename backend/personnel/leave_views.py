from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import write_audit
from common.permissions import HasModule
from personnel.models import Leave
from personnel.serializers import LeaveReadSerializer, LeaveWriteSerializer
from personnel.services import leaves_intersecting_month
from personnel.views import parse_year_month


class LeaveListCreateView(APIView):
    permission_classes = [HasModule('personnel')]

    def get(self, request):
        year, month = parse_year_month(request)
        leaves = leaves_intersecting_month(year, month).select_related('user').order_by(
            'date_from', 'user_id', 'id',
        )
        return Response(LeaveReadSerializer(leaves, many=True).data)

    def post(self, request):
        serializer = LeaveWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(created_by=request.user)
        write_audit(request.user, 'CREATE', 'personnel_leave', instance.pk)
        return Response(LeaveReadSerializer(instance).data, status=status.HTTP_201_CREATED)


class LeaveDetailView(APIView):
    permission_classes = [HasModule('personnel')]

    def patch(self, request, pk):
        instance = get_object_or_404(Leave, pk=pk)
        serializer = LeaveWriteSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        write_audit(request.user, 'UPDATE', 'personnel_leave', instance.pk)
        return Response(LeaveReadSerializer(instance).data)

    def delete(self, request, pk):
        instance = get_object_or_404(Leave, pk=pk)
        pk = instance.pk
        instance.delete()
        write_audit(request.user, 'DELETE', 'personnel_leave', pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
