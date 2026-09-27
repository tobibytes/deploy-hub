#!/usr/bin/env bash
# Writes a compressed database dump and a tar of every app's data volume, and
# keeps the last 14 of each. Meant for a nightly cron entry on the Pi:
#
#   crontab -e
#   15 3 * * * /home/pi/rig/deploy/backup.sh >> /home/pi/rig/deploy/backup.log 2>&1
#
# Set RIG_BACKUP_DIR to an external drive so a dead SD card does not take the
# backups with it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/.env"
BACKUP_DIR="${RIG_BACKUP_DIR:-$HERE/backups}"
KEEP="${RIG_BACKUP_KEEP:-14}"

[[ -f "$ENV_FILE" ]] || { echo "There is no deploy/.env." >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

mkdir -p "$BACKUP_DIR"
# `date -Is` is GNU only and errors on a Mac, so spell the format out.
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
STAMP="$(date +%Y-%m-%d_%H%M%S)"
TARGET="$BACKUP_DIR/rig_$STAMP.sql.gz"

docker compose --env-file "$ENV_FILE" -f "$HERE/compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-rig}" -d "${POSTGRES_DB:-rig}" --clean --if-exists \
  | gzip -9 > "$TARGET"

# A dump that failed halfway is worse than no dump, so check it before pruning.
if ! gzip -t "$TARGET"; then
  echo "The dump is damaged, keeping the older backups: $TARGET" >&2
  exit 1
fi

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "$(now) wrote $TARGET ($SIZE)"

# App data lives in named volumes, which pg_dump knows nothing about. Each one
# is tarred from inside a throwaway container, because the volume is not
# mounted anywhere on the host.
for volume in $(docker volume ls -q --filter name='^rig-.*-data$'); do
  VTARGET="$BACKUP_DIR/${volume}_$STAMP.tar.gz"
  if docker run --rm -v "$volume":/data:ro -v "$BACKUP_DIR":/backup alpine:latest \
      tar czf "/backup/$(basename "$VTARGET")" -C /data . 2>/dev/null; then
    if gzip -t "$VTARGET" 2>/dev/null; then
      echo "$(now) wrote $VTARGET ($(du -h "$VTARGET" | cut -f1))"
    else
      echo "$(now) the archive of $volume is damaged, removing it" >&2
      rm -f "$VTARGET"
    fi
  else
    echo "$(now) could not archive $volume" >&2
  fi
done

# Prune each kind separately, newest first, so a run of volume archives cannot
# push the database dumps out of the window.
prune() {
  ls -1t $1 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    echo "$(now) removing $old"
    rm -f "$old"
  done
}
prune "$BACKUP_DIR/rig_*.sql.gz"
for volume in $(docker volume ls -q --filter name='^rig-.*-data$'); do
  prune "$BACKUP_DIR/${volume}_*.tar.gz"
done
