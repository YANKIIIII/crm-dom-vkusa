"""Pytest bootstrap: force SQLite so unit tests don't need a running Postgres.

Overrides (not setdefault) so backend/.env values like USE_SQLITE=False / POSTGRES_HOST=db
cannot pull tests onto a Docker-only hostname.
"""
import os

os.environ['USE_SQLITE'] = 'True'
os.environ.setdefault('SECRET_KEY', 'test-only-insecure-key-not-for-production')
os.environ.setdefault('DEBUG', 'True')
os.environ.setdefault('ALLOWED_HOSTS', 'localhost,testserver')
