#!/usr/bin/env bash
# Writes a compressed database dump and keeps the last 14. Meant for a nightly
# cron entry on the Pi:
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
echo "$(date -Is) wrote $TARGET ($SIZE)"

# Prune, newest first.
ls -1t "$BACKUP_DIR"/rig_*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "$(date -Is) removing $old"
  rm -f "$old"
done
