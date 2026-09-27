#!/usr/bin/env bash
# The one command to run Rig on the server.
#
#   ./deploy/rig.sh up              start or update everything
#   ./deploy/rig.sh build           build the image here instead of pulling it
#   ./deploy/rig.sh down            stop everything, keeping the database
#   ./deploy/rig.sh logs [service]  follow the logs
#   ./deploy/rig.sh status          what is running, and the health check
#   ./deploy/rig.sh create-owner    set the owner's password
#   ./deploy/rig.sh backup          write a database dump now
#   ./deploy/rig.sh check           confirm the settings before a first run
#
# Running `up` again is always safe: migrations and the owner account are applied
# only if they are needed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_FILE="$HERE/.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$HERE/compose.yml")

# shellcheck source=../scripts/docker-check.sh
source "$ROOT/scripts/docker-check.sh"

die() { echo "$*" >&2; exit 1; }

check_env() {
  [[ -f "$ENV_FILE" ]] || die "There is no deploy/.env yet. Copy deploy/.env.example to deploy/.env and fill it in."
  local missing=()
  for key in BASE_DOMAIN SESSION_SECRET ENV_ENCRYPTION_KEY POSTGRES_PASSWORD OWNER_EMAIL TUNNEL_TOKEN; do
    local value
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
    [[ -n "$value" ]] || missing+=("$key")
  done
  if (( ${#missing[@]} > 0 )); then
    printf 'These settings are still empty in deploy/.env:\n' >&2
    printf '  %s\n' "${missing[@]}" >&2
    printf '\nGenerate the secrets with:\n  openssl rand -base64 48   # SESSION_SECRET\n  openssl rand -base64 32   # ENV_ENCRYPTION_KEY\n' >&2
    exit 1
  fi
  require_docker || exit 1
}

case "${1:-up}" in
  check)
    check_env
    echo "deploy/.env looks complete and Docker is running."
    "${COMPOSE[@]}" config >/dev/null && echo "The Compose file is valid."
    ;;

  up)
    check_env
    "${COMPOSE[@]}" pull --ignore-buildable || true
    "${COMPOSE[@]}" up -d --remove-orphans
    echo
    echo "Waiting for Rig to report healthy."
    for _ in $(seq 1 60); do
      if "${COMPOSE[@]}" exec -T rig node -e \
        "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
        echo "Rig is up. Open https://$(grep -E '^RIG_HOSTNAME=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
        exit 0
      fi
      sleep 2
    done
    echo "Rig did not report healthy in time. Look at: ./deploy/rig.sh logs rig" >&2
    exit 1
    ;;

  build)
    check_env
    docker build -t "${RIG_IMAGE:-rig:local}" \
      --build-arg "RIG_VERSION=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)" \
      "$ROOT"
    echo "Built ${RIG_IMAGE:-rig:local}. Set RIG_IMAGE=${RIG_IMAGE:-rig:local} in deploy/.env, then run: $0 up"
    ;;

  down)
    "${COMPOSE[@]}" down
    ;;

  restart)
    "${COMPOSE[@]}" restart "${2:-rig}"
    ;;

  logs)
    shift || true
    "${COMPOSE[@]}" logs -f --tail=200 "$@"
    ;;

  status)
    "${COMPOSE[@]}" ps
    echo
    "${COMPOSE[@]}" exec -T rig node -e \
      "fetch('http://127.0.0.1:3001/api/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))" \
      2>/dev/null || echo "The health check could not be read."
    ;;

  create-owner)
    "${COMPOSE[@]}" exec rig node dist/cli.js create-owner "${2:-}"
    ;;

  sign-out-all)
    "${COMPOSE[@]}" exec rig node dist/cli.js sign-out-all "${2:-}"
    ;;

  backup)
    "$HERE/backup.sh"
    ;;

  *)
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
