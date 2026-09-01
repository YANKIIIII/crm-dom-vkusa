#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ARCHIVE="${1:?usage: scripts/restore.sh backups/crm-YYYYMMDDTHHMMSSZ.sql.gz}"
set -a
source backend/.env
set +a
gunzip -c "${ARCHIVE}" | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
echo "Restored ${ARCHIVE}"
