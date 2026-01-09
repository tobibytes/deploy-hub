#!/usr/bin/env bash
set -euo pipefail

# Ignore SIGHUP to prevent terminal closes from killing the tunnel
trap '' HUP

child_pid=""
cleanup() {
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    echo "$(date -u +"%FT%TZ") INF stopping cloudflared (pid=$child_pid)" >> "${LOG_FILE}"
    kill "$child_pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$child_pid" 2>/dev/null; then
      kill -9 "$child_pid" 2>/dev/null || true
    fi
  fi
  exit 0
}
trap cleanup TERM INT

START_CMD=(cloudflared tunnel --no-autoupdate --protocol http2 --config "${CF_CONFIG_FILE}" run "${CF_TUNNEL_NAME}")

echo "$(date -u +"%FT%TZ") INF supervisor starting cloudflared with http2 protocol" >> "${LOG_FILE}"
restart_count=0
while true; do
  restart_count=$((restart_count + 1))
  echo "$(date -u +"%FT%TZ") INF starting cloudflared (attempt $restart_count)" >> "${LOG_FILE}"
  
  "${START_CMD[@]}" >> "${LOG_FILE}" 2>&1 &
  child_pid=$!
  wait "$child_pid"
  exit_code=$?
  
  echo "$(date -u +"%FT%TZ") WRN cloudflared exited (code=${exit_code}); restarting in 5s" >> "${LOG_FILE}"
  sleep 5
done
