# Rig

Rig is a small hosting platform that runs on one machine you own. You give it a
Docker image, a port and a name, and it runs the image and puts it on a public
HTTPS address like `hello.tobiolajide.com`.

It is built for a Raspberry Pi 5 on a home network, with no open ports and no
port forwarding: traffic arrives through a single outbound Cloudflare Tunnel.

```
Internet
   │  https://hello.tobiolajide.com, https://rig.tobiolajide.com
   ▼
Cloudflare (rig and *.tobiolajide.com point at the tunnel)
   │  outbound-only tunnel, nothing open at home
   ▼
┌──────────────── your server (docker compose) ─────────────────┐
│ cloudflared ─▶ traefik ─┬─▶ rig            rig.<domain>        │
│                         ├─▶ app: hello     hello.<domain>      │
│                         └─▶ app: ...       (labels set by rig) │
│                                                                │
│ rig ─▶ docker-socket-proxy ─▶ Docker   (rig never holds the    │
│ rig ─▶ postgres                         socket itself)         │
└────────────────────────────────────────────────────────────────┘
```

## Run it locally in one command

```sh
pnpm install
./scripts/dev.sh
```

It prints the dashboard address when it is ready. Sign in with `dev@localhost`
and `devpassword123`. There is no Cloudflare locally, so an app is reached by
sending its hostname to Traefik:

```sh
curl -H "Host: hello.tobipi.dev" http://localhost:8080
```

To put it on the real internet from your own machine, add `TUNNEL_TOKEN` to
`deploy/.env` and run `./scripts/infra.sh tunnel`. Stop it again with
`./scripts/infra.sh tunnel-down`. Only one machine may run a tunnel at a time.

## What it does

- Deploy an app from any Docker image that has a build for your server's CPU.
- Give every app its own HTTPS subdomain, published the moment its container
  starts and gone the moment it is deleted.
- Start, stop, restart and redeploy, with live logs, CPU and memory.
- Edit environment values, which are encrypted before they are stored.
- Come back on its own after a power cut, with the dashboard showing the truth
  rather than what it last remembered.

## How it is put together

| Part | Choice |
|---|---|
| Repo | One pnpm workspace: `apps/api`, `apps/web`, `packages/shared` |
| API | Node 22, TypeScript, Fastify 5, `dockerode`, zod |
| Database | Postgres 16 with Drizzle migrations applied at startup |
| Auth | One account, scrypt password, httpOnly cookie session stored in Postgres |
| Dashboard | Vite, React 19, TanStack Query, CSS Modules on one token file |
| Icons | Hugeicons, the set the MorganHacks organizer console uses, at 18px and 1.5 stroke |
| Routing | Traefik reading the Docker labels Rig sets |
| Getting in | One Cloudflare Tunnel (`cloudflared`) |
| Docker access | `docker-socket-proxy`, so Rig gets a narrow slice of the API |

Two choices differ from the original plan, both on purpose:

- **Passwords use Node's built-in scrypt** rather than argon2. scrypt needs no
  native module, so there is nothing to compile for arm64.
- **Containers drop every capability and add back eight** rather than running with
  none at all. Dropping everything breaks ordinary web images (nginx cannot hand
  its workers to an unprivileged user without `SETUID`/`SETGID`). The dangerous
  capabilities, raw sockets and kernel and device access, stay gone. The list is
  in `apps/api/src/docker/labels.ts` and is covered by tests.

## Running it on your server

You need a domain on Cloudflare, and Docker Engine with the Compose plugin.

### One time

1. Install 64-bit Raspberry Pi OS, then Docker Engine and the Compose plugin:
   ```sh
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER"   # log out and back in
   ```
2. In Cloudflare Zero Trust, under Networks then Tunnels, create a tunnel named
   `rig` and copy its token.
3. In that tunnel's public hostnames, add two entries, both pointing at
   `http://traefik:80`:
   - `rig.<your-domain>`
   - `*.<your-domain>`
4. Cloudflare adds the DNS records for you. Check that `rig` and `*` are both
   CNAMEs to the tunnel and both proxied. Records that already exist, like `www`,
   keep working, because a specific record beats the wildcard.
5. Clone this repo onto the server and fill in the settings:
   ```sh
   git clone https://github.com/tobibytes/deploy-hub.git && cd deploy-hub
   cp deploy/.env.example deploy/.env
   openssl rand -base64 48   # paste as SESSION_SECRET
   openssl rand -base64 32   # paste as ENV_ENCRYPTION_KEY
   openssl rand -base64 24   # paste as POSTGRES_PASSWORD
   nano deploy/.env          # also set APP_DOMAIN, OWNER_EMAIL, OWNER_PASSWORD, TUNNEL_TOKEN
   ./deploy/rig.sh check
   ```
6. Start it:
   ```sh
   ./deploy/rig.sh up
   ```
   Then open `https://rig.<your-domain>` and sign in with `OWNER_EMAIL` and
   `OWNER_PASSWORD`. Once you are in, clear `OWNER_PASSWORD` from `deploy/.env`.

Rig applies its own migrations, creates its network and makes the owner account
on every boot, so `./deploy/rig.sh up` is safe to run again at any time.

### Day to day

```sh
./deploy/rig.sh up              # start, or update to the latest image
./deploy/rig.sh status          # what is running, plus the health check
./deploy/rig.sh logs rig        # follow the logs
./deploy/rig.sh restart         # restart just Rig
./deploy/rig.sh create-owner    # change your password
./deploy/rig.sh backup          # write a database dump now
./deploy/rig.sh down            # stop, keeping the database
```

Nightly backups, keeping 14 days, onto a drive that is not the SD card:

```sh
crontab -e
# 15 3 * * * RIG_BACKUP_DIR=/mnt/usb/rig-backups /home/pi/rig/deploy/backup.sh >> /home/pi/rig/deploy/backup.log 2>&1
```

### Building the image on the server

`deploy/.env` points at a published multi-arch image by default. To build it on
the Pi instead:

```sh
RIG_IMAGE=rig:local ./deploy/rig.sh build
# then set RIG_IMAGE=rig:local in deploy/.env
./deploy/rig.sh up
```

## Working on it locally

```sh
pnpm install
./scripts/dev.sh
```

That writes a development `deploy/.env` the first time, starts Postgres, Traefik
and the Docker socket proxy in containers, then runs the API on
`http://127.0.0.1:3001` and the dashboard on the first free port from 5173. It
prints both addresses. Sign in with `dev@localhost` and `devpassword123`.

Two things it works out for you:

- **Which Docker.** If more than one engine is installed and the active context
  is not answering, it finds one that is, uses it for that run, and tells you the
  command to make it the default. It also writes that engine's socket path into
  `deploy/.env`, because Rig talks to Docker directly rather than through the CLI.
- **Which port.** It takes the first free port rather than failing, or binding
  IPv6 only and looking like it worked.

If Docker is not up at all, `./scripts/dev.sh --no-docker` runs Postgres on the
host instead, so you can work on the dashboard and the API. Deploying an app
needs Docker, and the health check says so.

There is no Cloudflare locally, so an app's address is reached by sending the
hostname to Traefik:

```sh
curl -H "Host: hello.tobiolajide.com" http://localhost:8080
```

Traefik's own dashboard, useful for seeing whether a route registered, is on
`http://localhost:8081`.

Other commands:

```sh
pnpm lint          # eslint
pnpm typecheck     # tsc across all three packages
pnpm test          # unit tests, and API tests when a test database is offered
pnpm build         # build the dashboard and bundle the API
pnpm smoke         # the whole flow against real Docker and Traefik
./scripts/infra.sh up | down | reset | logs | status
```

`pnpm smoke` is the one that proves it works: it signs in, deploys an app,
fetches it through Traefik, checks the container rules, reads logs and stats,
restarts it, deletes it, and confirms the address stops answering.

The API tests that need a database are skipped unless you offer one:

```sh
./scripts/infra.sh up
RIG_TEST_DATABASE_URL=postgresql://rig:rig@127.0.0.1:5433/rig pnpm --filter @rig/api test
```

## What each app gets

Every container Rig starts is treated the same way:

- Only the `rig_apps` network, which it shares with Traefik and nothing else. It
  cannot reach Postgres or the Rig API.
- No host ports and no bind mounts.
- `unless-stopped`, so it comes back after a reboot.
- Memory, CPU and process limits, and a capped log size.
- Every capability dropped, then eight added back (see above),
  `no-new-privileges`, never privileged.

Names become hostnames, so they have to be valid DNS labels, and `www`, `rig`,
`api`, `mail` and anything in `EXTRA_RESERVED_NAMES` cannot be used.

## Layout

```
apps/api/            Fastify server
  src/config.ts      every setting, validated at startup
  src/crypto.ts      passwords, session digests, environment encryption
  src/auth.ts        sessions and the guard
  src/apps-service.ts   the apps table and the deploy flow
  src/reconciler.ts  brings the database back in line with Docker
  src/docker/        client, container rules, Traefik labels, the engine
  src/routes/        auth, apps, health
  migrations/        generated SQL, applied at startup
apps/web/            Vite dashboard
  src/styles/tokens.css   the design tokens
  src/ui/icons.tsx   every glyph, mapped to Hugeicons in one place
  src/ui/kit.tsx     the component kit
  src/pages/         Login, Apps, NewApp, AppDetail, Activity, Settings
packages/shared/     types, zod schemas, name rules, used by both sides
deploy/              compose.yml, compose.dev.yml, rig.sh, backup.sh
scripts/             dev.sh, infra.sh, smoke.sh
docs/PLAN.md         the plan this was built from
```

## If something is wrong

- **The dashboard will not load.** `./deploy/rig.sh status` shows the health
  check. It names which of the database, Docker and Traefik is unreachable.
- **An app says "this image has no arm64 version".** The image has no build for
  your server's CPU. Pick another image or build one with
  `docker buildx build --platform linux/arm64`.
- **An app deploys but the address does not answer.** Check that the port you
  gave is the one the app listens on inside the container, and look at the app's
  logs. Traefik's view of the route is on its dashboard in development.
- **An app shows as stopped that you did not stop.** The reconciler found its
  container missing and said so in the Activity feed. Redeploy it.
- **Cloudflare returns 502.** `./deploy/rig.sh logs cloudflared traefik`. Check
  that the tunnel's public hostnames point at `http://traefik:80`.

## Not built yet

Deploying straight from a GitHub repo, custom domains per app, invite codes for
other people with quotas, and uptime checks that send a phone notification.
