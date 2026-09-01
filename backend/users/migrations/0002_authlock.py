from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuthLock',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(max_length=150, unique=True)),
                ('failed_count', models.PositiveSmallIntegerField(default=0)),
                ('locked_until', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'db_table': 'auth_locks',
            },
        ),
    ]
