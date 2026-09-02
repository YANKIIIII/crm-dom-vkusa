from rest_framework import serializers
from catalog.models import GrillType
from catalog.serializers import normalize_grill_type
from .models import Client, ClientPhone

class ClientSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    phone_comment = serializers.CharField(write_only=True, required=False, allow_blank=True)
    primary_phone = serializers.SerializerMethodField(read_only=True)
    grill_type_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Client
        fields = '__all__'
        read_only_fields = (
            'total_budget',
            'first_purchase_date',
            'last_purchase_date',
            'purchase_category',
            'created_at',
            'updated_at',
            'primary_phone',
            'grill_type_display',
        )

    def get_grill_type_display(self, obj):
        code = obj.grill_type
        if not code:
            return ''
        labels = self.context.get('grill_type_labels')
        if labels is None:
            labels = GrillType.label_map()
        return labels.get(code) or code

    def validate_grill_type(self, value):
        return normalize_grill_type(value)

    def create(self, validated_data):
        phone = validated_data.pop('phone', None)
        phone_comment = validated_data.pop('phone_comment', '')
        client = super().create(validated_data)
        if phone:
            ClientPhone.objects.create(
                client=client,
                number=phone,
                comment=phone_comment or '',
                is_primary=True,
            )
        return client

    def get_primary_phone(self, obj):
        phones = obj.phones.all()
        if not phones:
            return None
        for phone in phones:
            if phone.is_primary:
                return phone.number
        return phones[0].number

class ClientPhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientPhone
        fields = '__all__'

