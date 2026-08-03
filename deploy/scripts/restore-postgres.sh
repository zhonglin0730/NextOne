#!/bin/sh
set -eu

if [ -z "${RESTORE_FILE:-}" ]; then
  echo "RESTORE_FILE is required, for example /backups/nextone-20260801T120000Z.dump" >&2
  exit 2
fi

case "$RESTORE_FILE" in
  /backups/nextone-*.dump) ;;
  *)
    echo "RESTORE_FILE must be a /backups/nextone-*.dump file" >&2
    exit 2
    ;;
esac

if [ ! -f "$RESTORE_FILE" ]; then
  echo "Backup does not exist: $RESTORE_FILE" >&2
  exit 2
fi

psql --set=ON_ERROR_STOP=1 --command='DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

pg_restore \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --dbname="$PGDATABASE" \
  "$RESTORE_FILE"

echo "Restore completed: $RESTORE_FILE"
