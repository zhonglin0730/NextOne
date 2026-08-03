#!/bin/sh
set -eu

backup_directory=/backups
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_directory/nextone-$timestamp.dump"

mkdir -p "$backup_directory"
pg_dump --format=custom --no-owner --no-privileges --file="$backup_file"

find "$backup_directory" -type f -name 'nextone-*.dump' \
  -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete

echo "Backup created: $backup_file"
