#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p backups
# shellcheck disable=SC1091
set -a
source backend/.env
set +a
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="backups/crm-${STAMP}.sql.gz"
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  | gzip -c > "${OUT}"
find backups -name 'crm-*.sql.gz' -mtime +14 -delete
echo "Wrote ${OUT}"
