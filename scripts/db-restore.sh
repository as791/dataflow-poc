#!/usr/bin/env bash
# P0: DB restore from a backup file produced by db-backup.sh.
# Usage: bash scripts/db-restore.sh /path/to/backup.sql.gz
# WARNING: drops and recreates the target database. Irreversible.
set -euo pipefail

BACKUP="${1:?usage: db-restore.sh <backup.sql.gz>}"
DB_URL="${DATABASE_URL:-postgres://dataflow:dataflow@localhost:5432/dataflow}"
DB_NAME=$(basename "$(echo "$DB_URL" | sed 's|.*/||')")

echo "⚠ This will DROP and recreate database '$DB_NAME'. Ctrl-C to abort."
read -r -t 10 -p "Type 'yes' to continue: " confirm || true
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

BASE_URL="${DB_URL%/*}/postgres"
psql "$BASE_URL" -c "DROP DATABASE IF EXISTS ${DB_NAME};"
psql "$BASE_URL" -c "CREATE DATABASE ${DB_NAME};"
gunzip -c "$BACKUP" | psql "$DB_URL"
echo "Restore complete."
