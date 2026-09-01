from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0002_alter_productcard_base_cost_price_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='productcard',
            name='grill_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('charcoal', 'Угольный'),
                    ('gas', 'Газовый'),
                    ('ceramic', 'Керамический'),
                    ('electric', 'Электрический'),
                    ('pellet', 'Пеллетный'),
                ],
                max_length=20,
                null=True,
                verbose_name='Тип гриля',
            ),
        ),
    ]
