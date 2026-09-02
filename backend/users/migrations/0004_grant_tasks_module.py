from django.db import migrations
from users.access import append_tasks_module


def grant_tasks_to_existing_sellers(apps, schema_editor):
    User = apps.get_model('users', 'User')
    for user in User.objects.filter(role='seller').iterator():
        stored = user.modules or []
        updated = append_tasks_module(stored)
        if updated != list(stored):
            user.modules = updated
            user.save(update_fields=['modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_job_title_and_modules'),
    ]

    operations = [
        migrations.RunPython(grant_tasks_to_existing_sellers, migrations.RunPython.noop),
    ]
