from rest_framework import serializers
from users.access import ALL_MODULES, GRANTABLE_MODULES, effective_modules, stored_modules_for
from .models import User, UserProfile


class UserSerializer(serializers.ModelSerializer):
    modules = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'role',
            'job_title', 'modules',
            'is_active', 'date_joined', 'last_login', 'password',
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'date_joined': {'read_only': True},
            'last_login': {'read_only': True},
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['modules'] = effective_modules(instance)
        return data

    def validate_modules(self, value):
        unknown = [item for item in value if item not in ALL_MODULES]
        if unknown:
            raise serializers.ValidationError(
                f'Неизвестные доступы: {", ".join(unknown)}.'
            )
        role = self.initial_data.get('role') if hasattr(self, 'initial_data') else None
        if role is None and self.instance is not None:
            role = self.instance.role
        if role != 'manager':
            grantable = [item for item in value if item in GRANTABLE_MODULES]
            if not grantable:
                raise serializers.ValidationError('Укажите хотя бы один раздел.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        role = validated_data.get('role', User.Role.SELLER)
        validated_data['modules'] = stored_modules_for(
            role, validated_data.get('modules')
        )
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        role = validated_data.get('role', instance.role)
        if 'modules' in validated_data:
            modules = stored_modules_for(role, validated_data.get('modules'))
            if role != 'manager' and not modules:
                raise serializers.ValidationError(
                    {'modules': 'Укажите хотя бы один раздел.'}
                )
            validated_data['modules'] = modules
        elif role == User.Role.MANAGER:
            validated_data['modules'] = stored_modules_for(role)
        elif validated_data.get('role') and validated_data['role'] != instance.role:
            validated_data['modules'] = stored_modules_for(role)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = '__all__'
