from django.db.models.signals import post_save
from django.dispatch import receiver

from personnel.services import ensure_profile
from users.models import User


@receiver(post_save, sender=User)
def create_profile_for_user(sender, instance, created, **kwargs):
    if created:
        ensure_profile(instance)
