FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect static at build time for prod; harmless if DEBUG=True at runtime.
RUN SECRET_KEY=build-only \
    DEBUG=False \
    ALLOWED_HOSTS=localhost \
    USE_SQLITE=True \
    python manage.py collectstatic --noinput

EXPOSE 8000

# Production default. Local docker-compose overrides with runserver.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
