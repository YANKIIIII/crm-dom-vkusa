from decimal import Decimal

from rest_framework import serializers

from personnel.models import Leave
from users.models import User, UserProfile


class EmployeeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('phone', 'birthday', 'notes', 'hourly_rate', 'commission_percent')


class MonthWriteSerializer(serializers.Serializer):
    hours = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal('0.00'),
    )
    bonus = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.00'),
    )
    hourly_rate = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=False,
    )
    commission_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.00'),
        max_value=Decimal('100.00'), required=False,
    )


class LeaveUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'username', 'is_active')


class LeaveReadSerializer(serializers.ModelSerializer):
    user = LeaveUserSerializer(read_only=True)

    class Meta:
        model = Leave
        fields = ('id', 'user', 'kind', 'date_from', 'date_to', 'comment')


class LeaveWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Leave
        fields = ('id', 'user', 'kind', 'date_from', 'date_to', 'comment')
        read_only_fields = ('id',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields['user'].read_only = True

    def validate(self, attrs):
        date_from = attrs.get('date_from', getattr(self.instance, 'date_from', None))
        date_to = attrs.get('date_to', getattr(self.instance, 'date_to', None))
        if date_from and date_to and date_to < date_from:
            raise serializers.ValidationError(
                {'date_to': 'date_to не может быть раньше date_from.'}
            )
        return attrs
