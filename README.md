# Rig - Docker Container Management Platform

A full-stack application for managing Docker containers with a beautiful UI. Deploy, manage, and monitor Docker containers locally with ease.

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Expose locally on your domain using Cloudflare Tunnel

This repo includes a one-command flow to expose your local app through Cloudflare Tunnel without touching the Cloudflare dashboard.

### One-time setup

1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Authenticate once (writes cert to `~/.cloudflared/cert.pem`):
	```sh
	cloudflared tunnel login
	```

### Run with your domain

1. Optionally set a hostname. If omitted, the script generates a random subdomain on tobiolajide.com each run (e.g., lumen-ab12cd34.tobiolajide.com):
	```sh
	export CF_HOSTNAME=myapp.tobiolajide.com   # optional
	```
2. Start the public URL (idempotent – creates tunnel, DNS, config, and runs cloudflared):
	```sh
	make public
	```
3. Open the printed URL (the script always prints it):
	```
	Public URL: https://<your-random-or-custom-hostname>
	```

### Defaults and customization

- Defaults: `CF_TUNNEL_NAME=lumen`, `CF_HOSTNAME` auto-generated random subdomain on `tobiolajide.com`, `LOCAL_SERVICE=http://localhost:8080`, `CF_CONFIG_DIR=~/.cloudflared`, `CF_CONFIG_FILE=~/.cloudflared/config.yml`.
- Override by exporting env vars before `make public` (e.g., `export CF_HOSTNAME=myapp.tobiolajide.com`).
- Tunnel UUID is cached in `.forgequeue/tunnel_uuid`; PID in `.forgequeue/cloudflared.pid`; logs in `.forgequeue/cloudflared.log`.

### Stop / status

- Stop: `make public-stop`
- Status: `make public-status`

### How it works

- Ensures cloudflared is installed and `cloudflared tunnel login` was run (checks `~/.cloudflared/cert.pem`).
- Verifies the local service is reachable before starting.
- Reuses or creates the tunnel, writes `config.yml`, ensures DNS via `cloudflared tunnel route dns`, then starts the tunnel and prints the URL.

Optional: To run at login on macOS, you can install the cloudflared service (not required for normal use):
```sh
cloudflared service install
```
