#!/usr/bin/env bash
# Takes a backup of the database (and, if kept on disk, the uploaded files).
#
#   DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/school-erp ./backup.sh
#
# Writes   school_erp_<date>_<time>.dump   (a compressed PostgreSQL dump) into BACKUP_DIR, checks
# that it can be read back, and deletes backups older than KEEP_DAYS (default 30). Run it every
# night from cron. A backup that was never restored is not a backup: run restore-check.sh too.
#
# Optional:
#   FILES_DIR=/data/files          also archive the uploaded files (only when FILES_DRIVER=local)
#   BACKUP_S3_URI=s3://bucket/dir  also copy the backup there with the AWS CLI (off-site copy)
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database to back up}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

# pg_dump does not understand the "?schema=public" part Prisma uses.
URL="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/school_erp_${STAMP}.dump"

# Write to a temporary name first, so a half-finished file is never mistaken for a backup.
pg_dump --format=custom --no-owner --no-privileges --dbname="$URL" --file="$FILE.partial"
# Prove it can be read before keeping it.
pg_restore --list "$FILE.partial" > /dev/null
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"
echo "Database backup: $FILE ($(du -h "$FILE" | cut -f1))"

if [[ -n "${FILES_DIR:-}" && -d "$FILES_DIR" ]]; then
  ARCHIVE="$BACKUP_DIR/school_erp_files_${STAMP}.tar.gz"
  tar -czf "$ARCHIVE" -C "$FILES_DIR" .
  chmod 600 "$ARCHIVE"
  echo "Files backup:    $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
fi

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  aws s3 cp "$FILE" "${BACKUP_S3_URI%/}/$(basename "$FILE")" --only-show-errors
  echo "Copied off-site to ${BACKUP_S3_URI%/}/"
fi

# Keep the newest backups; remove old ones.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'school_erp_*.dump' -o -name 'school_erp_files_*.tar.gz' \) \
  -mtime "+$KEEP_DAYS" -print -delete | sed 's/^/Removed old backup: /'
