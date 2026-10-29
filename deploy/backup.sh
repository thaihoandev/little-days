#!/bin/sh
set -eu
# Run from the repository root. Requires a planned maintenance window.
backup_root=${BACKUP_ROOT:?Set BACKUP_ROOT to an absolute directory outside the application data}
case "$backup_root" in /*) ;; *) echo 'BACKUP_ROOT must be absolute' >&2; exit 1;; esac
[ -d "$backup_root" ] || { echo 'Create BACKUP_ROOT writable by container uid 1000 first' >&2; exit 1; }
compose() { docker compose -p "${COMPOSE_PROJECT_NAME:-little-days-staging}" --env-file .env.staging -f compose.yaml -f deploy/staging.yaml "$@"; }
trap 'compose start app worker' EXIT
trap 'exit 130' HUP INT TERM
compose stop worker app
sleep 20
archive="/backups/auto-$(date -u +%Y%m%dT%H%M%SZ)"
compose run --rm --no-deps -T -v "$backup_root:/backups" app node --import tsx scripts/backup-data.ts create --out "$archive"
compose run --rm --no-deps -T -v "$backup_root:/backups" app node --import tsx scripts/backup-data.ts verify --from "$archive"
compose run --rm --no-deps -T -v "$backup_root:/backups" app node --import tsx scripts/backup-retention.ts --root /backups --days "${BACKUP_RETENTION_DAYS:-14}" --execute
