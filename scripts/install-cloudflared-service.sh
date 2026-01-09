#!/usr/bin/env bash
set -euo pipefail

# Install cloudflared as a system service (recommended for production)
# This ensures:
#   - Auto reconnect on network changes
#   - Restart on failure
#   - Survive terminal closes and laptop sleep
#   - Persist across reboots

echo "🔧 Installing cloudflared as system service..."
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared is not installed"
  echo "Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

# Check if already authenticated
CERT_FILE="$HOME/.cloudflared/cert.pem"
if [ ! -f "$CERT_FILE" ]; then
  echo "❌ Not authenticated with Cloudflare"
  echo "Run first: cloudflared tunnel login"
  exit 1
fi

# Stop any existing supervisor-based tunnel
if [ -f .forgequeue/cloudflared.pid ]; then
  echo "ℹ️ Stopping existing supervisor-based tunnel..."
  bash scripts/public-url-stop.sh 2>/dev/null || true
fi

# Install service
echo "ℹ️ Installing cloudflared service (may require sudo)..."
if sudo cloudflared service install; then
  echo "✅ Service installed"
else
  echo "⚠️ Service may already be installed"
fi

# Copy config and credentials to system location
echo "ℹ️ Copying config and credentials to /etc/cloudflared..."
sudo mkdir -p /etc/cloudflared

if [ -f "$HOME/.cloudflared/config.yml" ]; then
  sudo cp "$HOME/.cloudflared/config.yml" /etc/cloudflared/config.yml
  echo "✅ Copied config.yml"
else
  echo "⚠️ No config.yml found in $HOME/.cloudflared/"
  echo "   Run 'make public' first to generate config"
fi

# Copy tunnel credentials
CRED_COUNT=$(find "$HOME/.cloudflared" -name "*.json" -type f 2>/dev/null | wc -l)
if [ "$CRED_COUNT" -gt 0 ]; then
  sudo cp "$HOME/.cloudflared"/*.json /etc/cloudflared/ 2>/dev/null || true
  echo "✅ Copied tunnel credentials"
else
  echo "⚠️ No tunnel credentials found"
fi

# Start/restart service
echo "ℹ️ Starting service..."
if sudo launchctl kickstart -k system/com.cloudflare.cloudflared; then
  echo "✅ Service started"
else
  echo "⚠️ Could not start service"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Useful commands:"
echo "  Check status:  sudo launchctl list | grep cloudflared"
echo "  View logs:     tail -f ~/.cloudflared/cloudflared.log"
echo "  Stop service:  sudo launchctl stop com.cloudflare.cloudflared"
echo "  Start service: sudo launchctl start com.cloudflare.cloudflared"
echo "  Uninstall:     sudo cloudflared service uninstall"
echo ""
echo "⚠️ Note: After installing as a service, use the service commands above"
echo "   instead of 'make public' and 'make public-stop'"
