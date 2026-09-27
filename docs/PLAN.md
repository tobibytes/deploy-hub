# Rig: rebuild plan

Rig (formerly Deploy Hub) is Tobi's own small hosting platform. You give it a Docker image, and it runs the image on his server and puts it on a public HTTPS URL like `hello.tobiolajide.com`.

This plan rebuilds it as one repo (frontend + backend), self-hosted on Tobi's Raspberry Pi 5, and working end to end.

## 1. What's wrong with the current version

I read `tobibytes/deploy-hub` before writing this. It's a solid start, but these problems stop it from being something you can leave running on the internet.

**Security (fix first)**
- `GET /api/containers`, `GET /api/containers/:id`, `POST /api/containers/:id/start`, `/stop`, `DELETE /api/containers/:id` and `GET /api/containers/:id/logs` have **no auth check**. Anyone who finds the URL can list, stop, delete or read the logs of every app.
- If `JWT_SECRET` isn't set, it silently falls back to `'your-secret-key'`, so anyone could forge a login.
- Signup is open, and any account can run any image. On a public box, that's a free server for whoever finds it (crypto miners, spam relays).
- Containers get host port bindings, and nothing limits their capabilities or process count.

**Things that make it fragile**
- Public URLs come from shell scripts that create a Cloudflare tunnel and DNS record per container. That breaks easily (see the commit history), and there's no clean undo when an app is deleted.
- The Dockerfile downloads the **amd64** `cloudflared`. The Pi 5 is **arm64**, so the image won't run there as written.
- Nothing re-syncs the database with Docker. After a reboot or crash, the dashboard shows stale statuses.
- The frontend is set up for Vercel and the backend for a separate host, so it needs CORS and two deploys.

**Clutter**
- Supabase leftovers (`src/integrations/supabase`, `supabase/migrations`) sit alongside a second `migrations/` folder, so there are two schemas.
- `server/index.ts` is one 1,000-line file.
- There are 7 markdown docs, 8 shell scripts and ~50 unused shadcn components.
- There are no tests.

## 2. What "done" means

From his phone, Tobi can:

1. Log in to `rig.tobiolajide.com`.
2. Create an app: name `hello`, image `nginxdemos/hello`, port `80`.
3. Watch it deploy, and within about a minute open `https://hello.tobiolajide.com` and see the page.
4. See live logs, CPU and memory, change an env var, restart, and delete it, after which the URL stops working.
5. Unplug the Pi, plug it back in, and have everything come back on its own, with the dashboard showing the right status.

No one else can log in, and no one without an account can do anything.

## 3. Decisions (and why)

| Decision | Choice | Why |
|---|---|---|
| Who can use it | **Owner only**, with optional invite codes later | Running arbitrary images for strangers on a home server isn't safe |
| Host | Raspberry Pi 5, 64-bit Raspberry Pi OS, Docker Engine + Compose | Tobi's own server; everything has to build for arm64 |
| Getting traffic in | **One** Cloudflare Tunnel (`cloudflared` container) | No open ports on the home network, no per-app tunnels |
| Routing to apps | **Traefik** reading Docker labels | Rig adds labels when it starts a container, and Traefik routes `hello.tobiolajide.com` to it. There are no host ports to manage |
| App URLs | `<app>.tobiolajide.com` via a wildcard `*.tobiolajide.com` DNS record pointing at the tunnel | Cloudflare's free certificate covers one level of subdomain. A second level like `hello.apps.tobiolajide.com` needs the paid Advanced Certificate Manager. Existing records (`www`, `dj`) keep working because specific records win over the wildcard |
| Repo | One pnpm workspace: `apps/web`, `apps/api`, `packages/shared` | Frontend and backend in one place, sharing types |
| Serving the frontend | The API serves the built React app | One container, one URL, no CORS |
| Backend | Node 22 + TypeScript + **Fastify** (or keep Express 5 if Tobi prefers) + `dockerode` + `zod` | Fastify has built-in schema validation and good streaming for logs |
| Database | Postgres 16 in the same Compose file, with **Drizzle** migrations | One schema, in code, versioned |
| Auth | Password (argon2) + **httpOnly cookie session** stored in Postgres | No tokens in localStorage, and sessions can be revoked |
| Frontend | Vite + React + TanStack Query, styled with **CSS Modules + one `tokens.css`** in the same design language as Tobi's room site (see section 10). Radix primitives only where accessibility needs them (dialog, dropdown, tabs) | Rig should look like it belongs next to tobiolajide.com, not like a default shadcn template |

## 4. How it fits together

```
Internet
   │ https://hello.tobiolajide.com, https://rig.tobiolajide.com
   ▼
Cloudflare (DNS: rig + *.tobiolajide.com → tunnel)
   │
   ▼  outbound-only tunnel, no open ports at home
┌─────────────────────── Raspberry Pi 5 (docker compose) ───────────────────────┐
│ cloudflared ──▶ traefik ──┬──▶ rig (api + web)       rig.tobiolajide.com         │
│                           ├──▶ app: hello            hello.tobiolajide.com       │
│                           └──▶ app: ...              (labels set by rig)         │
│                                                                                   │
│ rig ──▶ docker-socket-proxy ──▶ Docker Engine   (rig never gets the raw socket)  │
│ rig ──▶ postgres (volume)                                                         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

All user apps join one internal Docker network (`rig_apps`) that only Traefik shares with them. Apps can't reach Postgres or Rig's API.

## 5. Repo layout

```
rig/
  apps/
    api/            Fastify server: routes, docker service, reconciler, auth
      src/
        routes/     auth.ts, apps.ts, logs.ts, stats.ts, health.ts
        docker/     client.ts (via socket proxy), deploy.ts, labels.ts
        reconciler.ts
        db/         schema.ts, migrations/
    web/            Vite + React dashboard
      src/pages/    Login, Apps, AppDetail, NewApp, Activity, Settings
  packages/
    shared/         zod schemas + TS types used by both sides
  deploy/
    compose.yml     rig, postgres, traefik, cloudflared, docker-socket-proxy
    .env.example
    backup.sh       nightly pg_dump to a mounted drive
  Dockerfile        multi-stage; builds web, bundles into api image; linux/arm64 + amd64
  .github/workflows/ci.yml
  README.md         one README, how to run locally and on the Pi
```

## 6. Data model

- `users`: id, email, password_hash, role (`owner` | `member`), created_at
- `sessions`: id, user_id, expires_at, created_at
- `apps`: id, owner_id, name (unique, becomes the subdomain), image, internal_port, env (encrypted at rest with a key from `.env`), cpu_limit, memory_limit, status (`deploying` | `running` | `stopped` | `failed`), container_id, last_error, created_at, updated_at
- `events`: id, app_id, user_id, action (`create` | `deploy` | `start` | `stop` | `restart` | `env_change` | `delete`), status, message, created_at

## 7. API

Every route except `/api/health` and `/api/auth/login` needs a session. Every `/api/apps/:id*` route also checks that the app belongs to the caller (or that the caller is the owner).

| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | Session cookie; rate-limited to 5 tries per minute |
| GET | `/api/auth/me` | Current user |
| GET | `/api/apps` | The caller's apps, with live status |
| POST | `/api/apps` | Create + deploy: validate the name, pull the image, create the container with Traefik labels, start it, record an event |
| GET | `/api/apps/:id` | Detail + recent events |
| POST | `/api/apps/:id/{start,stop,restart,redeploy}` | Lifecycle. Redeploy pulls again and swaps the container |
| PATCH | `/api/apps/:id` | Change env or limits, then redeploy |
| DELETE | `/api/apps/:id` | Stop, remove the container, delete the row. The URL then stops resolving (Traefik drops the route) |
| GET | `/api/apps/:id/logs` | **Server-Sent Events** live log stream, with the last 200 lines first |
| GET | `/api/apps/:id/stats` | CPU %, memory, network, from `docker stats` |
| GET | `/api/health` | Checks the DB, the Docker proxy and Traefik |

## 8. Container rules (every app Rig starts)

- Network `rig_apps` only. No host port bindings.
- Labels: `traefik.enable=true`, `traefik.http.routers.<name>.rule=Host(\`<name>.tobiolajide.com\`)`, `traefik.http.services.<name>.loadbalancer.server.port=<internal_port>`, `rig.app_id=<id>`.
- `RestartPolicy: unless-stopped`, `Memory` (default 256 MB, max 1 GB), `NanoCpus` (default 0.5), `PidsLimit: 256`.
- `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`, never `Privileged`, never bind mounts.
- Image must include an arm64 build. Check before pulling, and show a clear error ("this image has no arm64 version") instead of a vague failure.
- Reserved names that can't be used for apps: `www`, `rig`, `dj`, `api`, `mail`, and any existing DNS record.

## 9. Reconciler

On boot and every 30 seconds, list containers with the `rig.app_id` label and compare them to the `apps` table:
- Update statuses that drifted.
- Mark apps whose container vanished as `stopped`, with a note.
- Remove orphan containers that have a Rig label but no row.

This is what makes "unplug the Pi and it comes back" true.

## 10. Interface: same design language as the room site

Rig uses the same look as Tobi's portfolio room (`reference/room-prototype.html` in this folder): dark ink background, Bricolage Grotesque headings, Instrument Sans body, JetBrains Mono labels, soft rounded cards, one accent color, and calm motion. The component shapes come from the same place the room's panels did, Arctic's organizer console (`MorganHacks/arctic`, `src/portaladmin`). Its rule applies here too: **color carries meaning or it's absent.**

Open the room prototype, click a few objects, and match the panels' feel. Don't invent a new style.

The two references, together:
- **Tobi's portfolio room** (`reference/room-prototype.html`): the dark palette, fonts, panel components and motion.
- **The MorganHacks admin portal** (`MorganHacks/arctic`, `src/portaladmin`): the console layout, sidebar, tables, stat tiles, pills, empty states and form controls. Its icons are **Hugeicons** (`@hugeicons/react` + `@hugeicons/core-free-icons`). Use the same set in Rig at 18px with a 1.5 stroke, so the two apps feel like siblings. For the empty states, reuse the portal's faint bar-sketch style.


### Tokens (`apps/web/src/styles/tokens.css`)

```css
:root{
  color-scheme: dark;
  /* ground, same as the room site */
  --ink:#0d0f15; --panel:#141720; --panel-2:#1c2030; --line:#2a2f40;
  --text:#ecebe6; --soft:#c9cbd3; --muted:#8d94a6;
  /* Rig's one accent: the Infra teal from the room's server rack */
  --accent:#5fd4b0; --accent-ink:#0d0f15;
  /* status, separate from the accent (from Arctic's dark palette) */
  --ok:#4cc08a;   --ok-soft:#12291f;
  --warn:#d6a53a; --warn-soft:#2a2214;
  --stop:#e0697a; --stop-soft:#2d1519;
  --idle:#8d94a6; --idle-soft:#1c2030;
  /* type */
  --display:"Bricolage Grotesque", system-ui, sans-serif;
  --body:"Instrument Sans", system-ui, sans-serif;
  --mono:"JetBrains Mono", ui-monospace, monospace;
  /* shape + motion */
  --r-sm:7px; --r:12px; --r-lg:16px;
  --ease:cubic-bezier(.2,.8,.2,1); --fast:120ms; --med:220ms;
}
```

Load the three fonts from Google Fonts with `font-display: swap`. Digits in tables, logs and stats use `font-variant-numeric: tabular-nums`.

### Components (build these once in `apps/web/src/ui/`, reuse everywhere)

| Component | Taken from | Used for |
|---|---|---|
| `StatusPill` | Room `.pill` + Arctic pill groups | App status. `running` → ok, `deploying` → warn (with a gentle pulse on the dot), `failed` → stop, `stopped` → idle. The dot is always there, so status still reads in greyscale |
| `Facts` | Room `.facts` / Arctic events `.details` | Two-column label/value grid: image, port, URL, created, CPU/memory limits |
| `Card` | Room `.sec` / Arctic home cards | Rounded 16px, 1px soft border, heading + optional subtitle. The only boxed surface; don't nest cards |
| `ListRow` | Room `.list` / Arctic "needs attention" list | Row with a tinted icon tile, title, small text, trailing action or arrow. The apps list, activity feed and settings links |
| `Tabs` | Room `.tabs` / Arctic home range toggle | App detail tabs: Overview, Logs, Environment, Activity, Settings |
| `Well` | Room `.well` / Arctic `.well` | Sunken read-only box: the live log view, the copyable URL, error details |
| `CopyField` | Room `.copy` / Arctic forms share chip | App URL and env values, with a Copy button that confirms "Copied" |
| `Button` | Arctic buttons | Pill-shaped. **Three kinds only:** primary (accent fill, one per screen, e.g. "Deploy"), secondary (bordered), danger (stop-soft fill, only in the Danger zone) |
| `Timeline` | Room leadership `.tl` | Deploy progress steps and the Activity tab: dot + line, event bold, detail muted |
| `StatTiles` | Arctic `.stats` | A quiet row at the top of Apps: running / stopped / failed counts. Only the failed tile gets color, and only when it's above 0 |
| `EmptyState` | Arctic `empty-state` | "No apps yet" with a faint sketch and one primary button |
| `Toast` | Arctic `error-toast` | Bottom-right, short, says what happened ("Restarted hello") |
| `Field`, `Input`, `Select` | Arctic form controls | Label above, hint below in muted, error in stop color. `Input` uses mono for image names and env keys |
| `Dialog` | Radix + Card styling | Confirm delete: type the app name to confirm |
| `Sparkline` | Room dashboard screen | CPU and memory mini charts on Overview. Accent line, faint grid, emphasized last point |

### Screens

- **Login:** centered card on the ink ground with the Rig mark, email + password, one primary button. Show the exact error ("Wrong email or password") in stop color.
- **Apps (home):**
  - Page head: "Apps" on the left, the primary **New app** button on the right.
  - `StatTiles` row, then one `ListRow` per app.
  - Each row: the app's server icon tile, name in bold, `name.tobiolajide.com` in mono muted, `StatusPill`, a quiet start/stop icon button, and the whole row links to detail.
  - With no apps, show the `EmptyState`.
- **New app:**
  - One `Card` form.
  - The name field shows the live URL preview underneath (`hello.tobiolajide.com`), and turns stop-colored with a reason if the name is taken or reserved.
  - The image field notes that the image must support arm64.
  - Port, then a small repeatable key/value list for env, then an "Advanced" disclosure for CPU and memory with sensible defaults.
  - On Deploy, the form swaps to a `Timeline` of live steps: Pulling image → Creating container → Starting → Routing → Live. The URL appears as a `CopyField` when done.
- **App detail:**
  - Header with name, `StatusPill`, URL `CopyField`, and actions (Restart, Stop/Start, Redeploy).
  - **Overview:** `Facts` + two `Sparkline`s.
  - **Logs:** a full-height `Well` in mono with live auto-scroll, a Pause button, a filter box, and a "Jump to latest" chip when scrolled up.
  - **Environment:** editable key/value rows with a Save & redeploy button. Values are hidden until you click the eye icon.
  - **Activity:** `Timeline`.
  - **Settings:** limits, plus the Danger zone with delete.
- **Settings (account):** change password, sign out everywhere.

### Layout

- A slim left sidebar (Apps, Activity, Settings) on desktop, 220px, the same ink as the page with a 1px line.
- On mobile it becomes a bottom tab bar.
- Content max width 1100px, 24px gutters (16px on phones).
- Everything has to work one-handed on a phone, since the "done" test in section 2 is done from his phone.

### Motion (same rules as the room site)

- Cards and list rows rise in with a short stagger on first load (70ms apart, 220ms each).
- The pill dot pulses only while `deploying`.
- Timeline steps pop their dot when they complete.
- Tab switch: content rises 8px and fades in.
- New log lines just append, with no animation per line (logs can be fast).
- `prefers-reduced-motion`: no motion at all.

### Copy rules

- Plain words from the user's side: "Deploy", "Restart", "Your app is live", "This image has no arm64 version, so it can't run on this server".
- No "text · text" separators and no em dashes in the interface.
- Errors say what happened and what to do next.

## 11. Testing

- **Unit (Vitest):** name validation, label generation, env encryption, limit parsing.
- **Integration:** the API against real Postgres and Docker (Testcontainers in CI). Deploy `nginxdemos/hello`, hit it through Traefik, stop it, delete it, and check that the route is gone. Also check that every protected route returns 401 without a session and 403 for someone else's app.
- **End to end (Playwright):** log in, create app, see "live", fetch the URL, get 200, delete.
- **CI (GitHub Actions):** lint, typecheck, and tests on every push. On `main`, build a multi-arch image (`linux/arm64,linux/amd64`) with buildx and push it to GHCR.

## 12. Running it on the Pi

One-time setup (Tobi):
1. Install 64-bit Raspberry Pi OS Lite, then Docker Engine + the Compose plugin.
2. In Cloudflare Zero Trust, create a tunnel named `rig` and copy its token.
3. In Cloudflare DNS for tobiolajide.com, add CNAME `rig` and CNAME `*`, both pointing to the tunnel, both proxied.
4. In the tunnel's public hostnames, send `rig.tobiolajide.com` and `*.tobiolajide.com` to `http://traefik:80`.
5. Copy `deploy/.env.example` to `.env` and fill in `TUNNEL_TOKEN`, `SESSION_SECRET`, `ENV_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` and `OWNER_EMAIL`. Rig refuses to start if any are missing.
6. Run `docker compose -f deploy/compose.yml up -d`, then `docker compose exec rig rig create-owner` to set the owner password.

Updates: `docker compose pull && docker compose up -d`. Backups: `deploy/backup.sh` on a nightly cron to the external drive, keeping 14 days.

## 13. Build order (stop and show Tobi after each)

1. **Skeleton:**
   - pnpm workspace, shared zod types, Fastify + Drizzle + Postgres, Vite app served by the API.
   - Login, logout, `me`, `create-owner` CLI.
   - Compose file with Postgres.
   - *Check:* Tobi can log in locally.
2. **Deploy engine:**
   - Docker via socket proxy, create/start/stop/restart/redeploy/delete, container rules, Traefik labels, reconciler.
   - Compose adds Traefik + socket proxy.
   - *Check:* locally, `curl -H "Host: hello.tobiolajide.com" localhost` returns the nginx page.
3. **Dashboard:**
   - Build the `ui/` components from section 10 first, then all screens, SSE logs, stats, env editing, activity.
   - *Check:* the full flow in a browser, locally, and it looks like it belongs next to `reference/room-prototype.html`.
4. **Tests + CI:**
   - Unit, integration and Playwright.
   - Multi-arch image to GHCR.
   - *Check:* green CI, with an arm64 image published.
5. **On the Pi:**
   - cloudflared in Compose, Tobi does the one-time Cloudflare steps, first real deploy, reboot test, backups.
   - *Check:* the five "done" steps in section 2, from his phone.
6. **Portfolio update:** once it's live, point the Infra panel on the room site at `rig.tobiolajide.com` and show a live demo app.

## 14. Later (not now)

- Deploy straight from a GitHub repo (build on the Pi with buildx, or in GitHub Actions and pull).
- Custom domains per app.
- Invite codes for friends, with per-user quotas.
- Uptime checks with a phone notification when an app goes down.
