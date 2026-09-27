#!/usr/bin/env bash
# The whole flow, end to end, against real Docker and real Traefik:
# sign in, deploy an app, fetch it through Traefik, read its logs and stats,
# then delete it and confirm the address stops answering.
#
#   ./scripts/smoke.sh
#
# It runs against the development stack, uses a throwaway app name, and cleans up
# after itself even if a step fails.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./docker-check.sh
source "$ROOT/scripts/docker-check.sh"

DOMAIN="${BASE_DOMAIN:-tobipi.dev}"
TRAEFIK_PORT="${TRAEFIK_HTTP_PORT:-8080}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
API_PORT="${SMOKE_API_PORT:-3099}"
API="http://127.0.0.1:$API_PORT"
APP_NAME="smoke-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
IMAGE="${SMOKE_IMAGE:-traefik/whoami}"
EMAIL="smoke@localhost"
PASSWORD="smoke-password-123"
JAR="$(mktemp)"
API_LOG="$(mktemp)"
API_PID=""
APP_ID=""
# Set once Docker has answered. Until then the cleanup trap must not call it,
# or a half-dead daemon turns a clean failure into a hang.
DOCKER_OK=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1" >&2; exit 1; }
step() { printf '\n%s\n' "$1"; }

cleanup() {
  local code=$?
  step "Cleaning up"
  if [[ -n "$APP_ID" ]]; then
    curl -s -b "$JAR" -X DELETE "$API/api/apps/$APP_ID" >/dev/null 2>&1 || true
  fi
  # Belt and braces: remove the container even if the API could not.
  if (( DOCKER_OK == 1 )); then
    run_with_deadline 20 docker rm -f "rig-$APP_NAME" || true
  fi
  if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  rm -f "$JAR"
  # Only worth printing if the API actually started and said something.
  if (( code != 0 )) && [[ -s "$API_LOG" ]]; then
    echo >&2
    echo "The API log:" >&2
    tail -40 "$API_LOG" >&2 || true
  fi
  rm -f "$API_LOG"
  exit $code
}
trap cleanup EXIT

step "Checking the tools"
require_docker || exit 1
DOCKER_OK=1
pass "Docker is answering"
DOCKER_SOCKET_PATH="${DOCKER_SOCKET_PATH:-$(docker_socket_path)}"
export DOCKER_SOCKET_PATH
pass "Rig will use the socket at ${DOCKER_SOCKET_PATH:-the default}"
ARCH="$(docker version --format '{{.Server.Arch}}')"
pass "This machine is $ARCH"

step "Starting Postgres, Traefik and the Docker socket proxy"
./scripts/infra.sh up >/dev/null
pass "The development containers are up"

step "Starting the API on port $API_PORT"
env \
  NODE_ENV=development \
  PORT="$API_PORT" \
  HOST=127.0.0.1 \
  BASE_DOMAIN="$DOMAIN" \
  DATABASE_URL="postgresql://rig:rig@127.0.0.1:$POSTGRES_PORT/rig" \
  SESSION_SECRET="smoke-session-secret-that-is-long-enough" \
  ENV_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  OWNER_EMAIL="$EMAIL" \
  OWNER_PASSWORD="$PASSWORD" \
  COOKIE_SECURE=false \
  DOCKER_HOST_URL="" \
  DOCKER_SOCKET_PATH="${DOCKER_SOCKET_PATH:-/var/run/docker.sock}" \
  APPS_NETWORK=rig_apps \
  TRAEFIK_PING_URL="http://127.0.0.1:${TRAEFIK_API_PORT:-8081}/ping" \
  TRAEFIK_METRICS_URL="http://127.0.0.1:${TRAEFIK_API_PORT:-8081}/metrics" \
  LOG_LEVEL=warn \
  WEB_DIST=/nowhere \
  pnpm --filter @rig/api exec tsx src/index.ts >"$API_LOG" 2>&1 &
API_PID=$!

HEALTH=""
for _ in $(seq 1 60); do
  HEALTH="$(curl -s --max-time 5 "$API/api/health" || true)"
  grep -q '"checks"' <<<"$HEALTH" && grep -q '"ok":true' <<<"$HEALTH" && break
  kill -0 "$API_PID" 2>/dev/null || fail "The API exited while starting."
  sleep 1
done
grep -q '"checks"' <<<"$HEALTH" || fail "The API never answered on /api/health."
pass "The API is answering"
for part in database docker traefik; do
  if grep -q "\"name\":\"$part\",\"ok\":true" <<<"$HEALTH"; then
    pass "$part is reachable"
  else
    fail "$part is not reachable. Health said: $HEALTH"
  fi
done

step "Signing in"
LOGIN_CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$API/api/auth/login")"
[[ "$LOGIN_CODE" == "200" ]] || fail "Signing in answered $LOGIN_CODE."
pass "Signed in and holding a session cookie"

NO_SESSION="$(curl -s -o /dev/null -w '%{http_code}' "$API/api/apps")"
[[ "$NO_SESSION" == "401" ]] || fail "Listing apps without a session answered $NO_SESSION, expected 401."
pass "Listing apps without a session is refused"

step "Deploying $APP_NAME from $IMAGE"
CREATED="$(curl -s -b "$JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$APP_NAME\",\"image\":\"$IMAGE\",\"internalPort\":80}" "$API/api/apps")"
APP_ID="$(printf '%s' "$CREATED" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
[[ -n "$APP_ID" ]] || fail "Creating the app failed: $CREATED"
pass "Created $APP_NAME ($APP_ID)"

STATUS=""
for _ in $(seq 1 120); do
  DETAIL="$(curl -s -b "$JAR" "$API/api/apps/$APP_ID")"
  STATUS="$(printf '%s' "$DETAIL" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)"
  [[ "$STATUS" == "deploying" ]] || break
  sleep 1
done
[[ "$STATUS" == "running" ]] || fail "The app ended up $STATUS. Detail: ${DETAIL:-none}"
pass "The app reached running"

step "Fetching it through Traefik"
BODY=""
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $APP_NAME.$DOMAIN" "http://127.0.0.1:$TRAEFIK_PORT/")"
  [[ "$CODE" == "200" ]] && break
  sleep 1
done
[[ "$CODE" == "200" ]] || fail "Traefik answered $CODE for $APP_NAME.$DOMAIN, expected 200."
BODY="$(curl -s -H "Host: $APP_NAME.$DOMAIN" "http://127.0.0.1:$TRAEFIK_PORT/")"
pass "$APP_NAME.$DOMAIN answered 200 through Traefik"
[[ -n "$BODY" ]] || fail "The response body was empty."
pass "The response has a body ($(printf '%s' "$BODY" | wc -c | tr -d ' ') bytes)"

step "Checking the container rules"
INSPECT="$(docker inspect "rig-$APP_NAME")"
grep -q '"PortBindings": {}' <<<"$INSPECT" || fail "The container published a host port."
pass "No host ports are published"
grep -q '"Privileged": false' <<<"$INSPECT" || fail "The container is privileged."
pass "The container is not privileged"
grep -q 'no-new-privileges' <<<"$INSPECT" || fail "no-new-privileges is not set."
pass "no-new-privileges is set"
grep -q '"PidsLimit": 256' <<<"$INSPECT" || fail "The process limit is not set."
pass "The process limit is set"
if grep -q '"Binds": null' <<<"$INSPECT" || grep -q '"Binds": \[\]' <<<"$INSPECT"; then
  pass "Nothing from the host is mounted"
else
  fail "The container has bind mounts."
fi
MEM="$(docker inspect -f '{{.HostConfig.Memory}}' "rig-$APP_NAME")"
[[ "$MEM" == "268435456" ]] || fail "The memory limit is $MEM, expected 268435456."
pass "The memory limit is 256 MB"

step "Checking what an app can reach"
# From section 11 of the hosting guide: an app must not be able to reach the
# database or the Docker API, whatever it does.
# curl already prints 000 when it cannot connect, so the fallback is only for
# the case where docker run itself fails. Appending a second 000 would make
# every comparison below miss.
probe_from_app() {
  local target="$1" out
  out="$(docker run --rm --network rig_apps curlimages/curl:latest \
    -s -o /dev/null -w '%{http_code}' --max-time 5 "$target" 2>/dev/null || true)"
  printf '%s' "${out:-000}"
}
[[ "$(probe_from_app http://postgres:5432/)" == "000" ]] \
  || fail "An app container can reach Postgres."
pass "An app cannot reach Postgres"
[[ "$(probe_from_app http://docker-proxy-ro:2375/version)" == "000" ]] \
  || fail "An app container can reach the Docker proxy."
pass "An app cannot reach the Docker API"

# And the proxy Traefik uses must refuse anything that changes state.
probe_proxy() {
  local out
  out="$(docker run --rm --network rig_dev_internal curlimages/curl:latest \
    -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" 2>/dev/null || true)"
  printf '%s' "${out:-000}"
}
[[ "$(probe_proxy http://docker-proxy-ro:2375/version)" == "200" ]] \
  || fail "Traefik's proxy cannot read the Docker version."
pass "Traefik's proxy can read"
[[ "$(probe_proxy -X POST http://docker-proxy-ro:2375/containers/create)" == "403" ]] \
  || fail "Traefik's proxy allowed a container to be created."
pass "Traefik's proxy refuses to create a container"

step "Reading logs and stats"
STATS="$(curl -s -b "$JAR" "$API/api/apps/$APP_ID/stats")"
grep -q 'memoryBytes' <<<"$STATS" || fail "Stats did not come back: $STATS"
pass "Stats came back"
LOGS="$(curl -s -N --max-time 6 -b "$JAR" "$API/api/apps/$APP_ID/logs" || true)"
grep -q 'event: open' <<<"$LOGS" || fail "The log stream did not open: $(head -c 200 <<<"$LOGS")"
pass "The log stream opened"

step "Restarting"
curl -fsS -b "$JAR" -X POST "$API/api/apps/$APP_ID/restart" >/dev/null || fail "Restart failed."
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $APP_NAME.$DOMAIN" "http://127.0.0.1:$TRAEFIK_PORT/")"
  [[ "$CODE" == "200" ]] && break
  sleep 1
done
[[ "$CODE" == "200" ]] || fail "After a restart Traefik answered $CODE."
pass "It still answers after a restart"

step "Deleting, and checking the address stops working"
DELETE_CODE="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X DELETE "$API/api/apps/$APP_ID")"
[[ "$DELETE_CODE" == "204" ]] || fail "Deleting answered $DELETE_CODE."
APP_ID=""
pass "Deleted"

if docker inspect "rig-$APP_NAME" >/dev/null 2>&1; then fail "The container is still there."; fi
pass "The container is gone"

GONE=""
for _ in $(seq 1 20); do
  GONE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $APP_NAME.$DOMAIN" "http://127.0.0.1:$TRAEFIK_PORT/")"
  [[ "$GONE" == "200" ]] || break
  sleep 1
done
[[ "$GONE" != "200" ]] || fail "$APP_NAME.$DOMAIN still answers 200 after deletion."
pass "$APP_NAME.$DOMAIN now answers $GONE"

step "All checks passed"
