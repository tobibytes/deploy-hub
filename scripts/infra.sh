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
        # The tunnel is opt-in, so a public address answering 1033 after a
        # restart is expected rather than broken. Say so here instead.
        if grep -qE '^TUNNEL_TOKEN=.+' "$ROOT/deploy/.env" 2>/dev/null \
          && [[ "$(docker inspect -f '{{.State.Running}}' rig-dev-cloudflared-1 2>/dev/null)" != "true" ]]; then
          echo "The Cloudflare tunnel is not running, so public addresses answer 1033."
          echo "Start it with: $0 tunnel"
        fi
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
    # A container left over from before a network change still points at a
    # network id that no longer exists, and fails with "network ... not found".
    # Compose reuses it rather than recreating, so clear it out first.
    if [[ -n "$(docker ps -aq --filter name=rig-dev-cloudflared --filter status=exited --filter status=created)" ]]; then
      echo "Removing a stopped cloudflared container so it is recreated against the current networks."
      docker rm -f rig-dev-cloudflared-1 >/dev/null 2>&1 || true
    fi
    "${COMPOSE[@]}" --env-file "$ROOT/deploy/.env" --profile tunnel up -d

    # Wait for it, and check the container is actually up rather than counting
    # lines in a log that may be left over from a previous run.
    for _ in $(seq 1 30); do
      if [[ "$(docker inspect -f '{{.State.Running}}' rig-dev-cloudflared-1 2>/dev/null)" == "true" ]] \
        && docker logs --since 2m rig-dev-cloudflared-1 2>&1 | grep -q "Registered tunnel connection"; then
        echo "cloudflared is connected. Follow it with: $0 logs cloudflared"
        exit 0
      fi
      sleep 2
    done
    echo "cloudflared did not connect. Look at: $0 logs cloudflared" >&2
    docker inspect -f 'state: {{.State.Status}} exit={{.State.ExitCode}}' rig-dev-cloudflared-1 2>/dev/null >&2 || true
    exit 1
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
