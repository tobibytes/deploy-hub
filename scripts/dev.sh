#!/usr/bin/env bash
# Everything needed to work on Rig locally: writes a development deploy/.env the
# first time, starts Postgres, then runs the API and the dashboard with hot
# reload. Ctrl-C stops both.
#
#   ./scripts/dev.sh              Postgres and Traefik in containers (needs Docker)
#   ./scripts/dev.sh --no-docker  Postgres on the host, for working on the
#                                 dashboard and the API when Docker is not up
#
# In --no-docker mode everything works except deploying an app, which needs
# Docker by definition. The health check will say so, which is correct.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./docker-check.sh
source "$ROOT/scripts/docker-check.sh"
ENV_FILE="$ROOT/deploy/.env"
PG_PORT="${POSTGRES_PORT:-5433}"
# Kept out of the repo, and short enough for the 103 byte limit on a unix socket path.
PG_DATA="${RIG_DEV_PGDATA:-$HOME/.rig-dev-postgres}"
PG_SOCKET=/tmp/rig-dev-pg
cd "$ROOT"

MODE=docker
if [[ "${1:-}" == "--no-docker" ]]; then MODE=host; fi

# This machine may already be running other things. Take the first free port
# rather than failing, or worse, binding IPv6 only and looking like it worked.
first_free_port() {
  local port="$1"
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done
  printf '%s' "$port"
}

VITE_PORT="${VITE_PORT:-$(first_free_port 5173)}"
export VITE_PORT

write_env() {
  local database_url="$1"
  [[ -f "$ENV_FILE" ]] && return 0
  echo "Writing a development deploy/.env."
  local session_secret env_key
  session_secret="$(openssl rand -base64 48 | tr -d '\n')"
  env_key="$(openssl rand -base64 32 | tr -d '\n')"
  cat > "$ENV_FILE" <<EOF
# Written by scripts/dev.sh for local development. Not for the Pi.
NODE_ENV=development
PORT=3001
# Development only. Loopback, so a dev instance with a known password is not
# reachable from the rest of the network. In Compose this stays 0.0.0.0 so
# Traefik can reach it.
HOST=127.0.0.1
BASE_DOMAIN=tobipi.dev
RIG_HOSTNAME=rig.tobipi.dev
EXTRA_RESERVED_NAMES=
GUARDED_DOMAINS=tobiolajide.com,oluwatobiolajide.com,madebytobi.com,tobiwashere.com

DATABASE_URL=$database_url
SESSION_SECRET=$session_secret
ENV_ENCRYPTION_KEY=$env_key
POSTGRES_PASSWORD=rig

OWNER_EMAIL=${OWNER_EMAIL:-dev@localhost}
OWNER_PASSWORD=${OWNER_PASSWORD:-devpassword123}

# The dashboard is served over plain http in development.
COOKIE_SECURE=false
# Running on the host, so talk to the local Docker socket directly.
DOCKER_HOST_URL=
APPS_NETWORK=rig_apps
TRAEFIK_PING_URL=http://127.0.0.1:${TRAEFIK_API_PORT:-8081}/ping
LOG_LEVEL=info
EOF
  echo "Sign in with ${OWNER_EMAIL:-dev@localhost} / ${OWNER_PASSWORD:-devpassword123}"
}

start_host_postgres() {
  command -v initdb >/dev/null 2>&1 || {
    cat >&2 <<'MSG'
--no-docker needs Postgres on this machine. On a Mac:

  brew install postgresql@14
  brew link --overwrite postgresql@14

MSG
    exit 1
  }

  mkdir -p "$PG_SOCKET"
  if [[ ! -d "$PG_DATA" ]]; then
    echo "Creating a development database cluster in $PG_DATA."
    initdb -D "$PG_DATA" -U rig --auth=trust -E UTF8 >/dev/null
  fi

  if pg_ctl -D "$PG_DATA" status >/dev/null 2>&1; then
    echo "Postgres is already running on port $PG_PORT."
  else
    pg_ctl -D "$PG_DATA" \
      -o "-p $PG_PORT -c listen_addresses=127.0.0.1 -k $PG_SOCKET" \
      -l "$PG_DATA/server.log" start >/dev/null
    echo "Started Postgres on port $PG_PORT."
  fi

  for _ in $(seq 1 30); do
    psql -h 127.0.0.1 -p "$PG_PORT" -U rig -d postgres -qtAc 'select 1' >/dev/null 2>&1 && break
    sleep 1
  done
  psql -h 127.0.0.1 -p "$PG_PORT" -U rig -d postgres -qtAc 'select 1' >/dev/null 2>&1 || {
    echo "Postgres did not start. Look at $PG_DATA/server.log" >&2
    exit 1
  }

  # Created once; harmless every run after that.
  psql -h 127.0.0.1 -p "$PG_PORT" -U rig -d postgres -qc 'create database rig' >/dev/null 2>&1 || true
}

if [[ "$MODE" == host ]]; then
  write_env "postgresql://rig@127.0.0.1:$PG_PORT/rig"
  start_host_postgres
  echo
  echo "Running without Docker. Deploying an app will fail until Docker is up,"
  echo "and the health check will say docker is unreachable. That is expected."
  echo "Stop the database later with:  pg_ctl -D $PG_DATA stop"
else
  write_env "postgresql://rig:rig@127.0.0.1:$PG_PORT/rig"
  require_docker || exit 1
  "$ROOT/scripts/infra.sh" up

  # Rig reaches Docker by socket, not through the CLI, so point it at the same
  # engine the containers just started on. Rewritten every run, because which
  # engine answers can change between runs.
  socket="$(docker_socket_path)"
  if [[ -n "$socket" ]]; then
    grep -q '^DOCKER_SOCKET_PATH=' "$ENV_FILE" \
      && sed -i '' "s|^DOCKER_SOCKET_PATH=.*|DOCKER_SOCKET_PATH=$socket|" "$ENV_FILE" \
      || printf 'DOCKER_SOCKET_PATH=%s\n' "$socket" >> "$ENV_FILE"
    echo "Rig will use the Docker socket at $socket"
  fi
fi

echo
echo "API       http://127.0.0.1:3001"
echo "Dashboard http://localhost:$VITE_PORT"
echo

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

pnpm --filter @rig/api dev &
pids+=($!)
pnpm --filter @rig/web dev &
pids+=($!)

# `wait -n` needs bash 4, and macOS still ships 3.2, so poll instead: as soon as
# either the API or the dashboard exits, stop the other one too.
while :; do
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null || { cleanup; exit 1; }
  done
  sleep 1
done
