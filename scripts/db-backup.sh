#!/usr/bin/env bash
# P0: DB backup — pg_dump → gzip → local file (optionally s3 cp if AWS CLI present).
# Run: bash scripts/db-backup.sh
# Env: DATABASE_URL (required), BACKUP_S3_PATH (optional, e.g. s3://bucket/backups/)
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://dataflow:dataflow@localhost:5432/dataflow}"
STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
OUT="/tmp/dataflow-backup-${STAMP}.sql.gz"

echo "Backing up to $OUT..."
pg_dump "$DB_URL" | gzip > "$OUT"
echo "Done: $(du -sh "$OUT" | cut -f1)"

if [[ -n "${BACKUP_S3_PATH:-}" ]]; then
  aws s3 cp "$OUT" "${BACKUP_S3_PATH%/}/dataflow-backup-${STAMP}.sql.gz"
  echo "Uploaded to ${BACKUP_S3_PATH}"
  rm "$OUT"
else
  echo "Set BACKUP_S3_PATH=s3://bucket/path/ to auto-upload. File kept at $OUT"
fi
