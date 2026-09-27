#!/usr/bin/env bash
# A Docker daemon that is half up accepts the connection and then never answers,
# so `docker version` can hang rather than fail. Every script that needs Docker
# sources this and calls `require_docker`, which gives up after a few seconds and
# says what is wrong.
#
# macOS has no coreutils `timeout`, so the deadline is done with a background
# process and a poll.

# Runs a command with a deadline. Returns 124 if it ran out of time.
run_with_deadline() {
  local seconds="$1"; shift
  "$@" >/dev/null 2>&1 &
  local pid=$!
  local waited=0
  local limit=$((seconds * 10))
  while kill -0 "$pid" 2>/dev/null; do
    if (( waited >= limit )); then
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  wait "$pid"
}

# More than one Docker can be installed (Docker Desktop and OrbStack, say), and
# the active context can be the broken one. Rather than making every command
# fail, find a context that answers and use it for this script only. The global
# setting is left alone.
find_working_context() {
  local context
  for context in $(docker context ls --format '{{.Name}}' 2>/dev/null); do
    [[ "$context" == "$(docker context show 2>/dev/null)" ]] && continue
    if DOCKER_CONTEXT="$context" run_with_deadline 6 docker version; then
      echo "$context"
      return 0
    fi
  done
  return 1
}

# The unix socket of whichever Docker context is in use. Rig talks to Docker
# directly rather than through the CLI, so it needs the path, not the context
# name. Empty if the endpoint is not a unix socket.
docker_socket_path() {
  local host
  host="$(docker context inspect "${DOCKER_CONTEXT:-$(docker context show 2>/dev/null)}" \
    --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  case "$host" in
    unix://*) printf '%s' "${host#unix://}" ;;
    *) printf '' ;;
  esac
}

require_docker() {
  local seconds="${1:-10}"
  run_with_deadline "$seconds" docker version
  local code=$?

  if (( code != 0 )); then
    local current working
    current="$(docker context show 2>/dev/null || echo unknown)"
    if working="$(find_working_context)"; then
      export DOCKER_CONTEXT="$working"
      echo "The \"$current\" Docker context is not answering, so this run uses \"$working\" instead."
      echo "To make that the default:  docker context use $working"
      return 0
    fi
  fi

  case "$code" in
    0) return 0 ;;
    124)
      cat >&2 <<MSG
Docker accepted the connection but did not answer within ${seconds} seconds.

That usually means Docker Desktop is running but the Linux VM behind it is not.
Quit Docker Desktop completely (its menu bar icon, then Quit) and open it again.
If it still does not come up, restart the machine.
MSG
      return 1
      ;;
    *)
      echo "Docker is not running. Start Docker Desktop (or the docker service) and try again." >&2
      return 1
      ;;
  esac
}
