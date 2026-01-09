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
HOSTNAME_TEMPLATE=${HOSTNAME_TEMPLATE:-'dep-{name}-{rand}.{domain}'}
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

# Export variables used by the supervisor process
export CF_CONFIG_FILE CF_TUNNEL_NAME LOG_FILE

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
  # Use sed for safer replacement (handles special chars better)
  tpl=$(echo "$tpl" | sed "s/{name}/$name_slug/g; s/{rand}/$rand/g; s/{domain}/$domain/g")
  echo "$tpl"
}

# Generate hostname from CONTAINER_NAME (set by deployment) or default to tunnel name
if [ -z "${CONTAINER_NAME:-}" ]; then
  # When called directly (not from backend), use tunnel name or a default
  CONTAINER_NAME="${CF_TUNNEL_NAME:-lumen}"
fi

NAME_SLUG="$(slugify "$CONTAINER_NAME")"
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

  # Try Docker directly first (most reliable for actual running port)
  if [ -n "$CONTAINER_NAME" ]; then
    if docker_port=$(docker port "$CONTAINER_NAME" 2>/dev/null | grep -o '0.0.0.0:[0-9]*' | head -n1 | cut -d: -f2); then
      if [ -n "$docker_port" ]; then
        echo "$docker_port"
        return 0
      fi
    fi
  fi

  if [ -n "$CONTAINER_ID" ]; then
    if docker_port=$(docker port "$CONTAINER_ID" 2>/dev/null | grep -o '0.0.0.0:[0-9]*' | head -n1 | cut -d: -f2); then
      if [ -n "$docker_port" ]; then
        echo "$docker_port"
        return 0
      fi
    fi
  fi

  # Fall back to API if Docker fails
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

# Always resolve the actual port from running container (don't use cached LOCAL_SERVICE)
if port=$(resolve_port); then
  LOCAL_SERVICE="http://localhost:${port}"
  echo "ℹ️  Detected container port: $port"
else
  LOCAL_SERVICE="http://localhost:8080"
  echo "⚠️  Could not detect container port, using default 8080"
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

# Reachability check: consider any HTTP response as reachable.
# Use HEAD request, no -f flag (so 404/403 still count), and short timeout.
if ! curl -sS -I -o /dev/null --max-time 3 "$LOCAL_SERVICE"; then
  echo "⚠️  Warning: LOCAL_SERVICE connection failed (not reachable): $LOCAL_SERVICE" >&2
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

# 3) Write config.yml (use 127.0.0.1 instead of localhost for IPv4/IPv6reliability)
# Replace localhost with 127.0.0.1 in LOCAL_SERVICE
LOCAL_SERVICE_EXPLICIT="${LOCAL_SERVICE//localhost/127.0.0.1}"

cat > "$CF_CONFIG_FILE" <<EOF
logfile: $LOG_FILE
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $CF_HOSTNAME
    service: $LOCAL_SERVICE_EXPLICIT
  - service: http_status:404
EOF

echo "✅ Config written to $CF_CONFIG_FILE"

# 4) Ensure DNS route exists (with validation)
echo "ℹ️ Setting up DNS route for $CF_HOSTNAME..."
route_output=$(cloudflared tunnel route dns "$CF_TUNNEL_NAME" "$CF_HOSTNAME" 2>&1) || route_exit=$?

if [ "${route_exit:-0}" -eq 0 ]; then
  echo "✅ DNS route created for $CF_HOSTNAME"
else
  if echo "$route_output" | grep -qi "already exists\|cname record"; then
    echo "✅ DNS route already exists for $CF_HOSTNAME"
  else
    echo "⚠️ DNS route error: $route_output"
    echo "⚠️ This may cause the tunnel to fail. Trying to continue..."
  fi
fi

echo "$CF_HOSTNAME" > "$LAST_HOST_FILE"

# 4b) Wait for DNS to resolve (with timeout and retries)
echo "ℹ️ Waiting for DNS to propagate..."
max_wait=30
elapsed=0
while [ $elapsed -lt $max_wait ]; do
  if nslookup "$CF_HOSTNAME" 8.8.8.8 >/dev/null 2>&1 || dig +short "$CF_HOSTNAME" @1.1.1.1 | grep -q .; then
    echo "✅ DNS resolved for $CF_HOSTNAME"
    break
  fi
  echo "  Waiting... ($elapsed/$max_wait seconds)"
  sleep 2
  elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $max_wait ]; then
  echo "⚠️ DNS did not resolve after $max_wait seconds"
  echo "⚠️ Tunnel may not be accessible, but continuing startup..."
fi

# 5) Stop prior run if present
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "ℹ️ Stopping previous cloudflared (pid $OLD_PID)"
    kill "$OLD_PID" || true
    sleep 2
    if ps -p "$OLD_PID" >/dev/null 2>&1; then
      kill -9 "$OLD_PID" || true
    fi
  fi
  rm -f "$PID_FILE"
fi

# 6) Start tunnel - use system service if available, otherwise supervised process
if command -v launchctl >/dev/null 2>&1 && [ -f "/Library/LaunchDaemons/com.cloudflare.cloudflared.plist" ]; then
  # Use system service (recommended for production)
  echo "ℹ️ Using cloudflared system service..."
  
  # Update system config
  sudo mkdir -p /etc/cloudflared 2>/dev/null || true
  if [ -w /etc/cloudflared ] || sudo -n true 2>/dev/null; then
    sudo cp "$CF_CONFIG_FILE" /etc/cloudflared/config.yml 2>/dev/null || cp "$CF_CONFIG_FILE" /etc/cloudflared/config.yml 2>/dev/null || echo "⚠️ Could not update /etc/cloudflared/config.yml"
    sudo cp "$CRED_FILE" /etc/cloudflared/ 2>/dev/null || cp "$CRED_FILE" /etc/cloudflared/ 2>/dev/null || echo "⚠️ Could not update credentials"
  fi
  
  # Restart service
  sudo launchctl kickstart -k system/com.cloudflare.cloudflared 2>/dev/null || launchctl kickstart -k system/com.cloudflare.cloudflared 2>/dev/null || echo "⚠️ Could not restart service"
  
  # Give it a moment to start
  sleep 2
  
  echo "✅ Tunnel started via system service"
  echo "ℹ️ Check status: sudo launchctl list | grep cloudflared"
  echo "ℹ️ View logs: tail -f $LOG_FILE"
else
  # Fallback: supervised process (for development)
  echo "ℹ️ Starting tunnel with supervisor (for production, run: sudo cloudflared service install)..."
  
  SUPERVISOR_SCRIPT=.forgequeue/cloudflared-supervisor.sh
  cat > "$SUPERVISOR_SCRIPT" <<'EOSH'
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
EOSH
  chmod +x "$SUPERVISOR_SCRIPT"
  
  # Detach and run supervisor; capture its PID for stop script
  nohup "$SUPERVISOR_SCRIPT" >/dev/null 2>&1 &
  NEW_PID=$!
  printf "%s" "$NEW_PID" > "$PID_FILE"
  
  echo "✅ Tunnel supervisor started (pid $NEW_PID)"
  echo "⚠️ For production use, install as system service:"
  echo "   sudo cloudflared service install"
fi

echo "Public URL: https://$CF_HOSTNAME"
