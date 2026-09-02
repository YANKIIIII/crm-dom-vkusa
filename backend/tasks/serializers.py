from rest_framework import serializers
from tasks.models import Board, Card, List


class OwnerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()


class CardNestedSerializer(serializers.ModelSerializer):
    order = serializers.SerializerMethodField()
    client = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = (
            'id', 'title', 'due_date', 'position', 'list',
            'order', 'client',
        )

    def get_order(self, obj):
        if obj.order_id is None:
            return None
        return {'id': obj.order_id, 'order_number': obj.order.order_number}

    def get_client(self, obj):
        if obj.client_id is None:
            return None
        return {
            'id': obj.client_id,
            'first_name': obj.client.first_name,
            'last_name': obj.client.last_name,
        }


class ListNestedSerializer(serializers.ModelSerializer):
    cards = CardNestedSerializer(many=True, read_only=True)

    class Meta:
        model = List
        fields = ('id', 'code', 'name', 'sort_order', 'cards')


class BoardListSerializer(serializers.ModelSerializer):
    owner = OwnerSerializer(read_only=True)

    class Meta:
        model = Board
        fields = ('id', 'owner')


class BoardDetailSerializer(serializers.ModelSerializer):
    owner = OwnerSerializer(read_only=True)
    lists = ListNestedSerializer(many=True, read_only=True)

    class Meta:
        model = Board
        fields = ('id', 'owner', 'lists')
