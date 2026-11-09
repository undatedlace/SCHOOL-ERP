#!/usr/bin/env bash
# Proves a backup works by restoring it into a throwaway database and comparing it with the live one.
#
#   DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/school-erp ./restore-check.sh [file.dump]
#
# With no file it uses the newest backup in BACKUP_DIR. The live database is only read. The scratch
# database (school_erp_restore_check) is created on the same server, then dropped. The role needs
# the CREATEDB permission. Exits with an error if anything differs. Run it weekly and after any
# change to how backups are taken.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the live database}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
LIVE="${DATABASE_URL%%\?*}"
FILE="${1:-$(ls -1t "$BACKUP_DIR"/school_erp_*.dump 2>/dev/null | head -n1 || true)}"
[[ -n "$FILE" && -f "$FILE" ]] || { echo "No backup file found (looked in $BACKUP_DIR)" >&2; exit 1; }

SCRATCH_NAME="school_erp_restore_check"
# The same server and login as the live database, with a different database name.
SCRATCH="${LIVE%/*}/${SCRATCH_NAME}"
ADMIN="${LIVE%/*}/postgres"

cleanup() { psql "$ADMIN" -q -c "DROP DATABASE IF EXISTS ${SCRATCH_NAME}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Restoring $FILE into a scratch database..."
psql "$ADMIN" -q -c "DROP DATABASE IF EXISTS ${SCRATCH_NAME}"
psql "$ADMIN" -q -c "CREATE DATABASE ${SCRATCH_NAME}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH" "$FILE"

# Row counts of every table, and the money that matters most, must match the live database.
# (Anything saved since the backup was taken will differ; run this just after a backup.)
COUNTS_SQL="$(psql "$LIVE" -At -c "
  SELECT string_agg(format('SELECT %L, count(*) FROM %I', tablename, tablename), ' UNION ALL ' ORDER BY tablename)
  FROM pg_tables WHERE schemaname = 'public'")"
MONEY_SQL="SELECT 'payments_total', coalesce(sum(amount), 0) FROM payments"
has_payments="$(psql "$LIVE" -At -c "SELECT to_regclass('public.payments') IS NOT NULL")"
QUERY="$COUNTS_SQL"
[[ "$has_payments" == "t" ]] && QUERY="$QUERY UNION ALL $MONEY_SQL"

LIVE_OUT="$(psql "$LIVE" -At -F '|' -c "$QUERY ORDER BY 1" | grep -v '^_prisma_migrations|' )"
BACK_OUT="$(psql "$SCRATCH" -At -F '|' -c "$QUERY ORDER BY 1" | grep -v '^_prisma_migrations|' )"

if [[ "$LIVE_OUT" == "$BACK_OUT" ]]; then
  TABLES="$(printf '%s\n' "$BACK_OUT" | wc -l | tr -d ' ')"
  echo "OK: the backup restores, and its $TABLES checked tables and payment total match the live database."
else
  echo "MISMATCH between the live database and the restored backup:" >&2
  diff <(printf '%s\n' "$LIVE_OUT") <(printf '%s\n' "$BACK_OUT") >&2 || true
  exit 2
fi
