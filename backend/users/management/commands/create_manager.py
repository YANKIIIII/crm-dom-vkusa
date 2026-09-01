from django.core.management.base import BaseCommand
from users.models import User


class Command(BaseCommand):
    help = 'Создать первую учётную запись руководителя, если username свободен.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--email', required=True)
        parser.add_argument('--password', required=True)
        parser.add_argument('--first-name', default='')
        parser.add_argument('--last-name', default='')

    def handle(self, *args, **options):
        username = options['username'].strip()
        if User.objects.filter(username__iexact=username).exists():
            self.stdout.write(self.style.WARNING(
                f'Пользователь {username} уже существует — пропуск.'
            ))
            return
        User.objects.create_user(
            username=username,
            email=options['email'],
            password=options['password'],
            first_name=options['first_name'],
            last_name=options['last_name'],
            role=User.Role.MANAGER,
        )
        self.stdout.write(self.style.SUCCESS(f'Руководитель {username} создан.'))
