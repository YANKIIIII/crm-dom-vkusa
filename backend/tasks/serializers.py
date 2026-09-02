from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from tasks.models import Board, Card, List
from tasks.services import place_card, user_can_access_board


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


class CardWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = ('id', 'list', 'title', 'due_date', 'order', 'client', 'position')
        read_only_fields = ('id',)

    def validate_title(self, value):
        title = (value or '').strip()
        if not title:
            raise serializers.ValidationError('Укажите название.')
        return title

    def validate_list(self, value):
        request = self.context['request']
        if self.instance is not None and value.board_id != self.instance.list.board_id:
            raise ValidationError('Нельзя перенести карточку на другую доску.')
        if not user_can_access_board(request.user, value.board):
            raise PermissionDenied
        return value

    def create(self, validated_data):
        dest = validated_data['list']
        position = validated_data.get('position')
        if position is None:
            position = dest.cards.count()
        card = Card(
            list=dest,
            title=validated_data['title'],
            due_date=validated_data.get('due_date'),
            order=validated_data.get('order'),
            client=validated_data.get('client'),
            position=position,
            created_by=self.context['request'].user,
        )
        card.save()
        return place_card(card, dest, position)

    def update(self, instance, validated_data):
        dest = validated_data.get('list', instance.list)
        if dest.board_id != instance.list.board_id:
            raise ValidationError({'list': 'Нельзя перенести карточку на другую доску.'})
        moving = 'list' in validated_data or 'position' in validated_data
        for field in ('title', 'due_date', 'order', 'client'):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        if moving:
            position = validated_data.get('position', instance.position)
            instance = place_card(instance, dest, position)
        return instance
