#!/usr/bin/env bash
# Stops app containers reaching anything private.
#
#   sudo ./deploy/harden-network.sh          apply the rules
#   sudo ./deploy/harden-network.sh status   show what is in place
#   sudo ./deploy/harden-network.sh remove   take them out again
#
# Why this is needed.
#
# Apps run on rig_apps. Putting the database and the Docker proxies on their own
# `internal` networks stops those networks reaching the internet, but it does
# not stop an app container reaching them: the host routes between bridge
# networks, so an app that knows an address can open a connection to it. By
# name it fails, because Docker's DNS does not resolve across networks, which
# makes the hole easy to miss. By IP it works.
#
# The read-write Docker proxy is the one that matters. Reaching it means
# creating a privileged container, which is the whole machine.
#
# This also blocks the home network behind the Pi, so a hosted app cannot scan
# or attack the router, a NAS, or anything else on the LAN.
#
# Linux only. The rules go in DOCKER-USER, which Docker leaves alone and
# consults before its own, and they survive `docker compose up` but not a
# reboot. Re-run from a systemd unit or @reboot cron.
set -euo pipefail

CHAIN=RIG-EGRESS
APPS_NETWORK="${APPS_NETWORK:-rig_apps}"

# Everything an app has no business reaching: every private range, which covers
# the other Rig networks and the home network the Pi sits on.
PRIVATE=(
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16
  169.254.0.0/16
  100.64.0.0/10
)

have() { command -v "$1" >/dev/null 2>&1; }

if ! have iptables; then
  echo "iptables is not installed. This script is for the Linux host Rig runs on." >&2
  exit 1
fi
if ! have docker; then
  echo "docker is not on the path, so the apps network cannot be found." >&2
  exit 1
fi

# Read the subnet rather than require it to be pinned. Docker assigns it when
# the network is made, and an existing install cannot change it without every
# app being stopped first.
APPS_SUBNET="$(docker network inspect "$APPS_NETWORK" \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"

if [[ -z "$APPS_SUBNET" ]]; then
  echo "Could not find the $APPS_NETWORK network. Start Rig first, then run this." >&2
  exit 1
fi

apply() {
  # A chain of its own, so applying twice is the same as applying once and
  # removing it does not disturb anyone else's rules.
  iptables -N "$CHAIN" 2>/dev/null || iptables -F "$CHAIN"

  # Apps must still reach each other and Traefik, which share this subnet.
  iptables -A "$CHAIN" -d "$APPS_SUBNET" -j RETURN
  # Replies to connections an app opened outward are fine.
  iptables -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN

  for range in "${PRIVATE[@]}"; do
    iptables -A "$CHAIN" -d "$range" -j DROP
  done

  # Anything else, meaning the internet, carries on.
  iptables -A "$CHAIN" -j RETURN

  # Send traffic from apps through it, once.
  if ! iptables -C DOCKER-USER -s "$APPS_SUBNET" -j "$CHAIN" 2>/dev/null; then
    iptables -I DOCKER-USER 1 -s "$APPS_SUBNET" -j "$CHAIN"
  fi

  echo "Apps on $APPS_SUBNET can reach the internet and each other, and nothing private."
}

remove() {
  iptables -D DOCKER-USER -s "$APPS_SUBNET" -j "$CHAIN" 2>/dev/null || true
  iptables -F "$CHAIN" 2>/dev/null || true
  iptables -X "$CHAIN" 2>/dev/null || true
  echo "Removed. App containers can reach private addresses again."
}

status() {
  if iptables -C DOCKER-USER -s "$APPS_SUBNET" -j "$CHAIN" 2>/dev/null; then
    echo "In place for $APPS_SUBNET:"
    iptables -S "$CHAIN" | sed 's/^/  /'
  else
    echo "Not in place. App containers can currently reach private addresses."
    return 1
  fi
}

case "${1:-apply}" in
  apply) apply ;;
  remove) remove ;;
  status) status ;;
  *) echo "Usage: $0 {apply|remove|status}" >&2; exit 1 ;;
esac
