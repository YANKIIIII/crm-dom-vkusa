from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0002_client_seller_alter_client_discount_percent_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='client',
            name='grill_type',
            field=models.CharField(blank=True, max_length=32, null=True, verbose_name='Тип гриля'),
        ),
    ]
