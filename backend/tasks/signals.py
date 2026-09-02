from django.db.models.signals import post_save
from django.dispatch import receiver
from users.models import User
from tasks.services import ensure_board


@receiver(post_save, sender=User)
def create_task_board_for_user(sender, instance, created, **kwargs):
    if created:
        ensure_board(instance)
