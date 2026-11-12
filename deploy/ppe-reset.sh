#!/usr/bin/env bash
# Wipes the PPE (test) database and fills it again: tables, roles, the Super Admin, demo data.
# DELETES EVERYTHING in that database. For the test copy only, never production.
#
#   PPE_DATABASE_URL='postgresql://...neon.tech/school_erp_ppe?sslmode=require' \
#   SEED_SCHOOL_NAME='Heera English School (Test)' \
#   SEED_ADMIN_EMAIL='you@example.com' SEED_ADMIN_PASSWORD='a-long-temporary-password' \
#   DEMO_PASSWORD='Demo@1234' \
#   deploy/ppe-reset.sh
#
# Safety: the database name must contain "ppe", and you must type it back to confirm.
set -euo pipefail

: "${PPE_DATABASE_URL:?Set PPE_DATABASE_URL to the PPE database}"
: "${SEED_ADMIN_EMAIL:?Set SEED_ADMIN_EMAIL}"
: "${SEED_ADMIN_PASSWORD:?Set SEED_ADMIN_PASSWORD}"

# The database name: after the last "/" and before any "?".
db_name="${PPE_DATABASE_URL##*/}"
db_name="${db_name%%\?*}"
if [[ "$db_name" != *ppe* ]]; then
  echo "Refusing: the database name \"$db_name\" does not contain \"ppe\"." >&2
  echo "Name the test database so it does (for example school_erp_ppe)." >&2
  exit 1
fi

read -r -p "This deletes everything in \"$db_name\". Type its name to go on: " answer
if [[ "$answer" != "$db_name" ]]; then
  echo "Stopped. Nothing was changed." >&2
  exit 1
fi

cd "$(dirname "$0")/../api"
export DATABASE_URL="$PPE_DATABASE_URL"

echo "Dropping and recreating the tables..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npx prisma migrate deploy --config prisma7.config.ts

echo "Roles, the school and the Super Admin..."
npx prisma db seed --config prisma7.config.ts

echo "Demo data..."
npm run -s seed:demo

echo "Done. Uploaded files in S3 under the ppe/ prefix are left as they are."
