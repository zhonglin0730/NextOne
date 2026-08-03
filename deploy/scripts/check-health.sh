#!/bin/sh
set -eu

health_url=${NEXTONE_HEALTH_URL:?NEXTONE_HEALTH_URL is required}
minimum_free_mb=${NEXTONE_MINIMUM_FREE_MB:-2048}
data_path=${NEXTONE_DATA_PATH:-/var/lib/docker}

if ! curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null; then
  echo "ALERT: NextOne health check failed: $health_url" >&2
  exit 1
fi

available_kb=$(df -Pk "$data_path" | awk 'NR == 2 {print $4}')
minimum_kb=$((minimum_free_mb * 1024))
if [ "$available_kb" -lt "$minimum_kb" ]; then
  echo "ALERT: NextOne host has less than ${minimum_free_mb}MB free at $data_path" >&2
  exit 1
fi

echo "NextOne healthy; free space $((available_kb / 1024))MB"
