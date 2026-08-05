from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import Order
from warehouse.services import WarehouseService
from clients.services import ClientService
from django.utils.timezone import now

@receiver(pre_save, sender=Order)
def track_status_change(sender, instance, **kwargs):
    if instance.pk:
        old_instance = Order.objects.get(pk=instance.pk)
        instance._old_status = old_instance.status
    else:
        instance._old_status = None

from common.models import AuditLog

@receiver(post_save, sender=Order)
def order_post_save(sender, instance, created, **kwargs):
    if created:
        AuditLog.objects.create(
            user=instance.created_by or instance.seller,
            action='CREATE',
            entity_type='order',
            entity_id=instance.pk,
            details={'status': instance.status}
        )
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status != instance.status:
            AuditLog.objects.create(
                user=instance.created_by or instance.seller,
                action='UPDATE',
                entity_type='order',
                entity_id=instance.pk,
                details={'old_status': old_status, 'new_status': instance.status}
            )
            if instance.status == 'cancelled':
                WarehouseService.release_items(instance)
            elif instance.status == 'completed' and old_status != 'completed':
                instance.completed_at = now()
                # Use update so we don't trigger signals again
                Order.objects.filter(pk=instance.pk).update(completed_at=instance.completed_at)
                ClientService.update_budget_on_completion(instance)


