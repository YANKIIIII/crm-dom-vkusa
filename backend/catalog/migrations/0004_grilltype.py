from django.db import migrations, models


DEFAULT_GRILL_TYPES = [
    ('charcoal', 'Угольный', 10),
    ('gas', 'Газовый', 20),
    ('ceramic', 'Керамический', 30),
    ('electric', 'Электрический', 40),
    ('pellet', 'Пеллетный', 50),
]


def seed_grill_types(apps, schema_editor):
    GrillType = apps.get_model('catalog', 'GrillType')
    for code, name, sort_order in DEFAULT_GRILL_TYPES:
        GrillType.objects.get_or_create(
            code=code,
            defaults={'name': name, 'sort_order': sort_order},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0003_alter_productcard_grill_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='GrillType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=32, unique=True, verbose_name='Код')),
                ('name', models.CharField(max_length=100, verbose_name='Наименование')),
                ('sort_order', models.PositiveSmallIntegerField(default=100, verbose_name='Порядок')),
            ],
            options={
                'db_table': 'grill_types',
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.AlterField(
            model_name='productcard',
            name='grill_type',
            field=models.CharField(blank=True, max_length=32, null=True, verbose_name='Тип гриля'),
        ),
        migrations.RunPython(seed_grill_types, migrations.RunPython.noop),
    ]
