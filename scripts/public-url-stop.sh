#!/usr/bin/env bash
set -euo pipefail

PID_FILE=${PID_FILE:-.forgequeue/cloudflared.pid}

if [ ! -f "$PID_FILE" ]; then
  echo "No cloudflared pid file found ($PID_FILE)."
  exit 0
fi

PID=$(cat "$PID_FILE")
if ps -p "$PID" >/dev/null 2>&1; then
  echo "Stopping cloudflared (pid $PID)..."
  kill "$PID" || true
  sleep 1
  if ps -p "$PID" >/dev/null 2>&1; then
    echo "Force killing cloudflared (pid $PID)..."
    kill -9 "$PID" || true
  fi
  echo "Stopped."
else
  echo "cloudflared not running (pid $PID stale)."
fi
rm -f "$PID_FILE"
