#!/usr/bin/env bash
# Starts and stops the containers that development needs: Postgres, Traefik and
# the Docker socket proxy. The API and the dashboard run on the host.
#
#   ./scripts/infra.sh up | down | reset | logs | status
#   ./scripts/infra.sh tunnel        also start cloudflared (needs TUNNEL_TOKEN)
#   ./scripts/infra.sh tunnel-down   stop just cloudflared
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/deploy/compose.dev.yml")

# shellcheck source=./docker-check.sh
source "$ROOT/scripts/docker-check.sh"

case "${1:-up}" in
  up)
    require_docker || exit 1
    "${COMPOSE[@]}" up -d
    echo "Waiting for Postgres."
    for _ in $(seq 1 40); do
      if "${COMPOSE[@]}" exec -T postgres pg_isready -U rig -d rig >/dev/null 2>&1; then
        echo "Postgres is ready on localhost:${POSTGRES_PORT:-5433}."
        echo "Traefik is on http://localhost:${TRAEFIK_HTTP_PORT:-8080} (its own dashboard on :${TRAEFIK_API_PORT:-8081})."
        exit 0
      fi
      sleep 1
    done
    echo "Postgres did not become ready. Check: ${COMPOSE[*]} logs postgres" >&2
    exit 1
    ;;
  down)
    require_docker || exit 1
    "${COMPOSE[@]}" down
    ;;
  reset)
    require_docker || exit 1
    echo "This deletes the local development database."
    "${COMPOSE[@]}" down -v
    "$0" up
    ;;
  logs)
    require_docker || exit 1
    shift || true
    "${COMPOSE[@]}" logs -f "$@"
    ;;
  status)
    require_docker || exit 1
    "${COMPOSE[@]}" ps
    ;;
  tunnel)
    # Brings up cloudflared as well, so the real hostnames reach this machine.
    require_docker || exit 1
    if ! grep -qE '^TUNNEL_TOKEN=.+' "$ROOT/deploy/.env" 2>/dev/null; then
      cat >&2 <<'MSG'
There is no TUNNEL_TOKEN in deploy/.env yet.

In Cloudflare Zero Trust, go to Networks, then Tunnels, and either create a
tunnel named "rig" or open the one you have. Copy its token and add the line

  TUNNEL_TOKEN=<the token>

to deploy/.env yourself, then run this again. The token is a credential, so
keep it out of the repo; deploy/.env is already ignored by git.
MSG
      exit 1
    fi
    "${COMPOSE[@]}" --env-file "$ROOT/deploy/.env" --profile tunnel up -d
    echo "cloudflared is up. Follow it with: $0 logs cloudflared"
    ;;
  tunnel-down)
    require_docker || exit 1
    "${COMPOSE[@]}" --env-file "$ROOT/deploy/.env" --profile tunnel stop cloudflared
    ;;
  *)
    echo "Usage: $0 {up|down|reset|logs|status|tunnel|tunnel-down}" >&2
    exit 1
    ;;
esac
