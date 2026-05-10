# deploy-hub

A full-stack Docker container management platform — pull any public image, launch it, wire up a local port, watch its logs, manage env vars, and expose it on the public internet via Cloudflare Tunnel, all from a React UI.

Think of it as a personal mini-PaaS: it talks to the Docker engine directly, persists deployments to Postgres, and gates everything behind JWT auth.

## What it does

- **Container lifecycle** — deploy from a Docker image, start / stop / restart / delete, set CPU + memory limits, auto-allocate host ports.
- **Per-container env vars** — read and update environment without redeploying.
- **Logs** — tail container stdout/stderr.
- **Deployment history** — every action is persisted; users see their containers, admins see everyone's.
- **Auth + roles** — JWT-based signup/signin, `requireAdmin` middleware on admin routes.
- **Monitoring UI** — stats, log feed, and a clean dashboard. See [`MONITORING_UI_GUIDE.md`](./MONITORING_UI_GUIDE.md).
- **Public exposure** — `make public` provisions a Cloudflare Tunnel + DNS record and prints a public HTTPS URL.

## API surface

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/signup` / `/signin` / `/change-password` | JWT auth |
| `GET`  | `/api/auth/me` | Current user |
| `GET`  | `/api/containers` | List all (admin) |
| `GET`  | `/api/app/containers` | List the caller's containers |
| `POST` | `/api/containers` | Deploy a new container from an image |
| `GET`  | `/api/containers/:id` | Inspect |
| `POST` | `/api/containers/:id/start` / `/stop` / `/restart` | Lifecycle |
| `DELETE` | `/api/containers/:id` | Remove |
| `GET`  | `/api/containers/:id/logs` | Tail logs |
| `GET` / `PUT` | `/api/containers/:id/env` | Env var management |
| `GET`  | `/api/deployments` | Deployment history |
| `GET`  | `/api/monitoring/{logs,stats}` | App-level monitoring |
| `GET`  | `/api/admin/{logs,stats}` | Admin-only views |

Full handler implementations are in [`server/index.ts`](./server/index.ts). See [`DEPLOYMENT_README.md`](./DEPLOYMENT_README.md) and [`ERROR_HANDLING.md`](./ERROR_HANDLING.md) for deeper docs.

## Architecture

```
React (Vite, shadcn/ui)  ──HTTP──▶  Express server  ──dockerode──▶  Docker Engine
                                         │
                                         ├──▶  Postgres (deployments, users, env)
                                         │
                                         └──▶  Cloudflare Tunnel (optional public URL)
```

- **`src/`** — React SPA: pages for Dashboard, Containers, Deployments, Domains, Monitoring, Admin, Settings, Auth.
- **`server/`** — Express + TypeScript backend; `dockerode` for Docker control, `get-port` for auto-allocation, JWT middleware.
- **`migrations/`** — Postgres schema (`001_initial_schema.sql`, `002_add_public_url.sql`, `003_add_container_port.sql`).

## Run it

Prereqs: Node 18+, Docker Engine running, Postgres reachable.

```sh
npm install
npm run dev:all     # starts the Vite frontend (:3000) and the API (:3001) together
```

### Expose it publicly with Cloudflare Tunnel

```sh
# One-time: cloudflared tunnel login
export CF_HOSTNAME=myapp.tobiolajide.com  # optional; else a random subdomain
make public                                # idempotent: tunnel + DNS + run
make public-status
make public-stop
```

The tunnel UUID is cached in `.forgequeue/tunnel_uuid`; logs in `.forgequeue/cloudflared.log`.

## Stack

**Frontend** — Vite · React · TypeScript · Tailwind · shadcn/ui · Radix · React Hook Form · TanStack Query

**Backend** — Node.js · Express · TypeScript · `dockerode` · `jsonwebtoken` · `pg`

**Infra** — Docker · Postgres · Cloudflare Tunnel · custom `Dockerfile`
