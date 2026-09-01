# CRM Дом Вкуса

Django 6.1 + DRF + Postgres 17 · React 19 + Vite + nginx.

## Быстрый старт (разработка)

1. Скопировать `backend/.env.example` → `backend/.env`, задать `SECRET_KEY` и `POSTGRES_PASSWORD`. Для локалки можно `DEBUG=True`.
2. `docker compose up --build`
3. `docker compose exec backend python manage.py migrate`
4. Только DEBUG: `docker compose exec backend python manage.py load_mock_data` (логины `aleksey` / `valentin`, пароль `123`).
5. UI: http://localhost:5173 · API: http://localhost:8000/api/v1/ · схема: http://localhost:8000/api/docs/ (нужна авторизация).

Файл `docker-compose.override.yml` — локальный (в git не входит). На сервер его не копировать.

## Продакшен

Стек: `docker-compose.prod.yml` (gunicorn + nginx SPA, Postgres без порта наружу).

1. Клонировать репозиторий на Ubuntu, скопировать `backend/.env.example` → `backend/.env`.
2. Обязательно: `DEBUG=False`, длинный `SECRET_KEY`, сильный `POSTGRES_PASSWORD`, `ALLOWED_HOSTS=ваш.домен,backend`, `CORS_ALLOWED_ORIGINS=https://ваш.домен`.
3. `docker compose -f docker-compose.prod.yml up --build -d`
4. `docker compose -f docker-compose.prod.yml exec backend python manage.py migrate`
5. `docker compose -f docker-compose.prod.yml exec backend python manage.py seed_references`
6. `docker compose -f docker-compose.prod.yml exec backend python manage.py create_manager --username ... --email ... --password ...`

UI: https://ваш.домен (`VITE_API_URL=/api/v1` зашит в `frontend/Dockerfile.prod`). Caddy в `docker-compose.prod.yml` берёт 80/443 и выпускает Let's Encrypt.

Не запускать `load_mock_data` в проде (`DEBUG=False` — команда откажется).

### HTTPS

Caddy в том же Compose терминирует TLS и проксирует на `frontend:80`. В `Caddyfile` укажите домен(ы), DNS A-запись должна смотреть на VPS.

- В `.env`: `SECURE_SSL_REDIRECT=False` (`docker-compose.prod.yml` уже задаёт это для backend).
- Cloudflare оранжевое облако ломает HTTP-01 Let's Encrypt — либо серое облако, либо TLS на стороне Cloudflare вместо Caddy.

## Резервное копирование

Ежедневно в 03:00 (crontab на хосте):

```
0 3 * * * cd /opt/crm-dom-vkusa && /usr/bin/bash scripts/backup.sh >> /var/log/crm-backup.log 2>&1
```

Архивы: `backups/crm-*.sql.gz`, хранение 14 дней. Восстановление:

```bash
scripts/restore.sh backups/crm-YYYYMMDDTHHMMSSZ.sql.gz
```

После restore — `migrate` не нужен, если дамп с той же схемы. Проверка restore — раз в месяц на копии тома, не на проде.

## Тесты

```bash
docker compose exec -T backend python -m pytest -q
cd frontend && npm run lint && npm run build
```
