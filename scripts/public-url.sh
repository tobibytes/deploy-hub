#!/usr/bin/env bash
set -euo pipefail

# Automated Cloudflare Tunnel setup for a stable public URL
# Requirements (one-time):
#   cloudflared tunnel login
# Config (env or YAML at .forgequeue/public-url.yml):
#   cert_file: /path/to/cert.pem (supports host-mounted path)
#   api_base: http://localhost:3001/api (for dynamic port discovery)
#   container_id: <id> OR container_name: <name>
#   local_service: http://localhost:1234 (skip discovery)
#   local_port: 1234 (discovery helper)
#   tunnel_name: lumen
#   domain: example.com
#   hostname_template: dep-{name}-{rand}.{domain}

CF_TUNNEL_NAME=${CF_TUNNEL_NAME:-lumen}
DEFAULT_DOMAIN=${DEFAULT_DOMAIN:-tobiolajide.com}
HOSTNAME_TEMPLATE=${HOSTNAME_TEMPLATE:-dep-{name}-{rand}.{domain}}
API_BASE=${API_BASE:-}
CONTAINER_ID=${CONTAINER_ID:-}
CONTAINER_NAME=${CONTAINER_NAME:-}
LOCAL_PORT=${LOCAL_PORT:-}
CONFIG_FILE=${PUBLIC_URL_CONFIG:-.forgequeue/public-url.yml}
CF_CONFIG_DIR=${CF_CONFIG_DIR:-$HOME/.cloudflared}
CF_CONFIG_FILE=${CF_CONFIG_FILE:-$CF_CONFIG_DIR/config.yml}
PID_FILE=${PID_FILE:-.forgequeue/cloudflared.pid}
TUNNEL_FILE=${TUNNEL_FILE:-.forgequeue/tunnel_uuid}
CERT_FILE=${CERT_FILE:-$CF_CONFIG_DIR/cert.pem}
LOG_FILE=${LOG_FILE:-.forgequeue/cloudflared.log}
LAST_HOST_FILE=${LAST_HOST_FILE:-.forgequeue/last_hostname}

mkdir -p "$CF_CONFIG_DIR" .forgequeue

# Load optional flat YAML-style config (key: value, no nesting).
if [ -f "$CONFIG_FILE" ]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    if [ -z "$(echo "$line" | tr -d '[:space:]')" ]; then
      continue
    fi
    key="${line%%:*}"
    value="${line#*:}"
    key="$(echo "$key" | tr -d '[:space:]')"
    value="$(echo "$value" | sed 's/^[[:space:]]*//')"
    case "$key" in
      cert_file) CERT_FILE=${CERT_FILE:-$value} ;;
      api_base) API_BASE=${API_BASE:-$value} ;;
      container_id) CONTAINER_ID=${CONTAINER_ID:-$value} ;;
      container_name) CONTAINER_NAME=${CONTAINER_NAME:-$value} ;;
      local_service) LOCAL_SERVICE=${LOCAL_SERVICE:-$value} ;;
      local_port) LOCAL_PORT=${LOCAL_PORT:-$value} ;;
      tunnel_name) CF_TUNNEL_NAME=${CF_TUNNEL_NAME:-$value} ;;
      domain) DEFAULT_DOMAIN=${DEFAULT_DOMAIN:-$value} ;;
      hostname_template) HOSTNAME_TEMPLATE=${HOSTNAME_TEMPLATE:-$value} ;;
      hostname) CF_HOSTNAME=${CF_HOSTNAME:-$value} ;;
    esac
  done < "$CONFIG_FILE"
fi

# Default API base for discovery if provided
API_BASE=${API_BASE:-http://localhost:3001/api}

rand_suffix() {
  LC_CTYPE=C tr -dc 'a-z0-9' </dev/urandom | head -c8 || true
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//' | sed 's/-*$//' | sed 's/--*/-/g'
}

template_hostname() {
  local name_slug="$1"
  local rand="$2"
  local domain="$3"
  local tpl="$HOSTNAME_TEMPLATE"
  tpl="${tpl//\{name\}/$name_slug}"
  tpl="${tpl//\{rand\}/$rand}"
  tpl="${tpl//\{domain\}/$domain}"
  echo "$tpl"
}

NAME_SLUG="$(slugify "${CONTAINER_NAME:-$CF_TUNNEL_NAME}")"
[ -z "$NAME_SLUG" ] && NAME_SLUG="app"
RAND_SEG="$(rand_suffix)"

if [ -z "${CF_HOSTNAME:-}" ]; then
  CF_HOSTNAME="$(template_hostname "$NAME_SLUG" "$RAND_SEG" "$DEFAULT_DOMAIN")"
fi
LOCAL_SERVICE=${LOCAL_SERVICE:-}

pick_port_from_json() {
  node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
function pickPort(obj) {
  if (!obj) return null;
  if (obj.metadata && obj.metadata.port) return Number(obj.metadata.port);
  if (obj.port) return Number(obj.port);
  const portsArray = obj.ports || obj.Ports || [];
  for (const p of portsArray) {
    if (p && (p.PublicPort || p.publicPort)) return Number(p.PublicPort || p.publicPort);
  }
  const ns = obj.NetworkSettings && obj.NetworkSettings.Ports;
  if (ns && typeof ns === 'object') {
    const key = Object.keys(ns).find(k => Array.isArray(ns[k]) && ns[k][0] && ns[k][0].HostPort);
    if (key) return Number(ns[key][0].HostPort);
  }
  return null;
}
const mode = process.argv[2];
const matchName = process.argv[3];
let target = payload;
if (mode === 'list') {
  const items = payload.containers || [];
  target = items.find(c => c.name === matchName || (Array.isArray(c.Names) && c.Names.includes('/' + matchName)) || c.id === matchName || c.Id === matchName);
}
const port = pickPort(target);
if (port) {
  console.log(port);
} else {
  process.exit(1);
}
NODE
}

resolve_port() {
  if [ -n "${LOCAL_PORT:-}" ]; then
    echo "$LOCAL_PORT"
    return 0
  fi

  if [ -n "$API_BASE" ]; then
    if [ -n "$CONTAINER_ID" ]; then
      if json=$(curl -fsS "$API_BASE/containers/$CONTAINER_ID" 2>/dev/null); then
        if port=$(echo "$json" | pick_port_from_json detail "$CONTAINER_ID" 2>/dev/null); then
          echo "$port"
          return 0
        fi
      fi
    fi

    if [ -n "$CONTAINER_NAME" ]; then
      if json=$(curl -fsS "$API_BASE/containers" 2>/dev/null); then
        if port=$(echo "$json" | pick_port_from_json list "$CONTAINER_NAME" 2>/dev/null); then
          echo "$port"
          return 0
        fi
      fi
    fi
  fi
  return 1
}

if [ -z "$LOCAL_SERVICE" ]; then
  if port=$(resolve_port); then
    LOCAL_SERVICE="http://localhost:${port}"
  else
    LOCAL_SERVICE="http://localhost:8080"
  fi
fi

# 1) Validate prerequisites
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared is not installed. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

if [ ! -f "$CERT_FILE" ]; then
  echo "❌ Cert file not found at $CERT_FILE" >&2
  echo "Run: cloudflared tunnel login" >&2
  exit 1
fi

if ! curl -fsS -o /dev/null "$LOCAL_SERVICE"; then
  echo "⚠️  Warning: LOCAL_SERVICE is not immediately reachable: $LOCAL_SERVICE" >&2
  echo "⚠️  The container may still be starting up. Continuing with tunnel setup..." >&2
fi

# 2) Ensure tunnel exists (idempotent)
get_tunnel_id() {
  cloudflared tunnel list 2>/dev/null | awk -v name="$CF_TUNNEL_NAME" 'NR>1 && $2==name {print $1; exit}'
}

TUNNEL_ID=""
if [ -f "$TUNNEL_FILE" ]; then
  TUNNEL_ID=$(cat "$TUNNEL_FILE")
fi

if [ -z "$TUNNEL_ID" ]; then
  TUNNEL_ID=$(get_tunnel_id || true)
fi

if [ -z "$TUNNEL_ID" ]; then
  echo "ℹ️ Creating tunnel $CF_TUNNEL_NAME..."
  cloudflared tunnel create "$CF_TUNNEL_NAME"
  # After creation, pick the newest credentials file
  latest_json=$(ls -t "$CF_CONFIG_DIR"/*.json 2>/dev/null | head -n1 || true)
  if [ -z "$latest_json" ]; then
    echo "❌ Unable to locate tunnel credentials JSON after creation" >&2
    exit 1
  fi
  TUNNEL_ID=$(basename "$latest_json" .json)
fi

echo "$TUNNEL_ID" > "$TUNNEL_FILE"
CRED_FILE="$CF_CONFIG_DIR/${TUNNEL_ID}.json"
if [ ! -f "$CRED_FILE" ]; then
  echo "❌ Credentials file missing: $CRED_FILE" >&2
  exit 1
fi

# 3) Write config.yml
cat > "$CF_CONFIG_FILE" <<EOF
logfile: $LOG_FILE
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $CF_HOSTNAME
    service: $LOCAL_SERVICE
  - service: http_status:404
EOF

echo "✅ Config written to $CF_CONFIG_FILE"

# 4) Ensure DNS route exists (idempotent)
if ! cloudflared tunnel route dns "$CF_TUNNEL_NAME" "$CF_HOSTNAME" >/dev/null 2>&1; then
  echo "ℹ️ DNS route may already exist for $CF_HOSTNAME; continuing"
fi

echo "✅ DNS route ensured for $CF_HOSTNAME"
echo "$CF_HOSTNAME" > "$LAST_HOST_FILE"

# 5) Stop prior run if present
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "ℹ️ Stopping previous cloudflared (pid $OLD_PID)"
    kill "$OLD_PID" || true
    sleep 1
  fi
fi

# 6) Start tunnel
nohup cloudflared tunnel --config "$CF_CONFIG_FILE" run "$CF_TUNNEL_NAME" >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
printf "%s" "$NEW_PID" > "$PID_FILE"

echo "✅ Tunnel started (pid $NEW_PID)"
echo "Public URL: https://$CF_HOSTNAME"
