# Rig: hosting guide

This file covers how Rig runs on Tobi's Raspberry Pi and how apps get public HTTPS
addresses. It goes with `PLAN.md`.

The gap check between this file and the repo lives in `deploy/STATUS.md`.

---

## 1. The big picture

```
Browser
  │  https://dj.tobipi.dev   https://rig.tobipi.dev   https://tobifm.com
  ▼
Cloudflare  (DNS + HTTPS certificates + DDoS protection)
  │  one Cloudflare Tunnel. The Pi dials out; no ports open on the home router
  ▼
┌──────────────────────── Raspberry Pi 5 (docker compose) ────────────────────────┐
│                                                                                 │
│  cloudflared ──▶ traefik :80 ──┬──▶ rig (API + dashboard)    rig.tobipi.dev      │
│                                ├──▶ app container "dj"       dj.tobipi.dev      │
│                                │                             tobifm.com         │
│                                └──▶ any other app            <name>.tobipi.dev  │
│                                                                                 │
│  rig ──▶ docker-proxy-rw ──▶ /var/run/docker.sock   (create/start/stop apps)     │
│  traefik ──▶ docker-proxy-ro ──▶ /var/run/docker.sock (read labels only)         │
│  postgres (Rig's own data)                                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The key idea: **Cloudflare never learns that an app exists.** A wildcard DNS record
already sends every `*.tobipi.dev` request to the Pi. Traefik then picks the right
container by reading Docker labels that Rig sets. Creating an app is purely a
Docker operation.

## 2. Domains

| Domain | What it's for | Who sets it up |
|---|---|---|
| `tobipi.dev` | Hosting domain. Apps get `<name>.tobipi.dev`, and the dashboard is `rig.tobipi.dev` | Tobi, once |
| `tobifm.com` | First custom domain, pointing at the AI DJ app (`dj`) | Tobi, once |
| `tobiolajide.com`, `oluwatobiolajide.com`, `madebytobi.com`, `tobiwashere.com` | Tobi's other sites. Rig must refuse to attach these to an app unless the guard is turned off in settings | Nobody, through Rig |

Rules:
- The base domain comes from `BASE_DOMAIN` in `.env`. Never hard-code `tobipi.dev`
  in code; only use it in docs, examples and tests.
- App names become **one level** of subdomain only (`dj.tobipi.dev`). Cloudflare's
  free certificate doesn't cover `a.b.tobipi.dev`.
- Name format: lowercase letters, numbers and hyphens, 2 to 32 characters,
  starting with a letter, not ending in a hyphen.
- Reserved names: `www`, `rig`, `api`, `mail`, `status`, `admin`, `traefik`.
- `.dev` is HTTPS-only in every browser. That's fine, because Cloudflare serves
  HTTPS for us.

## 3. What Tobi does by hand (one time)

Not automated in v1. The checklist lives in `deploy/README.md`.

1. **The Pi**
   - Install 64-bit Raspberry Pi OS Lite. Boot from an SSD (NVMe HAT or USB)
     rather than the SD card, because Docker writes a lot and SD cards wear out.
   - Install Docker Engine and the Compose plugin.
   - Turn on log rotation in `/etc/docker/daemon.json`:
     `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}`.
     Then restart Docker.
2. **Cloudflare account**
   - Add `tobipi.dev` and `tobifm.com` to the Free plan, in the same account.
   - Switch their nameservers at the registrar.
3. **Tunnel**
   - In Cloudflare Zero Trust, go to Networks, then Tunnels, and create a tunnel
     named `rig` of type "Cloudflared".
   - Copy the token into `.env` as `TUNNEL_TOKEN`.
4. **Public hostnames on that tunnel.** All send to service `http://traefik:80`:
   - `rig.tobipi.dev`
   - `*.tobipi.dev`
   - `tobifm.com`
   - `www.tobifm.com`
5. **DNS check**
   - Make sure `tobipi.dev` has proxied (orange cloud) CNAMEs for `rig` and `*`,
     both pointing to `<tunnel-id>.cfargotunnel.com`. The dashboard usually
     creates them, but it may not create the wildcard one, so add it by hand if
     it's missing.
   - `tobifm.com` gets its record created automatically.
6. **Redirect:** add a redirect rule that sends `www.tobifm.com/*` to
   `https://tobifm.com/$1` with a 301.
7. **Go:** fill in `.env`, then `docker compose -f deploy/compose.yml up -d`, then
   `docker compose -f deploy/compose.yml exec rig rig create-owner`.

## 4. `deploy/compose.yml` (target shape)

Keep these properties: two socket proxies with different rights, Traefik never
touching the raw socket, and no host ports except the optional local ones.

- All images must publish arm64 builds. Check with
  `docker buildx imagetools inspect <image>`.
- `socket-ro`, `socket-rw` and `db` are `internal`, so app containers can never
  reach the Docker API or Postgres.
- Rig's own container uses the same label style as apps. The dashboard is just
  another route.
- Traefik trusts cloudflared's forwarded headers:
  `--entrypoints.web.forwardedHeaders.trustedIPs=172.16.0.0/12`.

`docker-proxy-ro` (Traefik): `CONTAINERS=1 NETWORKS=1 EVENTS=1 POST=0`.

`docker-proxy-rw` (Rig): `CONTAINERS=1 IMAGES=1 NETWORKS=1 VOLUMES=1 EVENTS=1
INFO=1 POST=1 ALLOW_START=1 ALLOW_STOP=1 ALLOW_RESTARTS=1`, everything else 0.

## 5. What happens when an app is created

`POST /api/apps` with `{ name, image, port, env, limits, volume? }`:

1. **Validate:** name rules from section 2, not reserved, not taken; port 1 to
   65535; valid env keys.
2. **Check arch:** inspect the image manifest. If it has no `linux/arm64`, stop
   with "This image has no version for the Pi (arm64). Rebuild it with
   `--platform linux/arm64`."
3. **Pull:** stream progress into the app's event log. For private GHCR images,
   pass the registry credentials (section 8).
4. **Create the container:**

| Setting | Value |
|---|---|
| Name | `rig-<name>` |
| Network | `rig_apps` only |
| Host ports | none |
| Labels | `rig.app_id=<id>`, `traefik.enable=true`, `traefik.http.routers.<name>.rule=<rule>`, `traefik.http.routers.<name>.entrypoints=web`, `traefik.http.services.<name>.loadbalancer.server.port=<port>` |
| Rule | `` Host(`<name>.<BASE_DOMAIN>`) ``, plus `` \|\| Host(`<custom>`) `` for each custom domain |
| Restart | `unless-stopped` |
| Limits | memory default 256 MB (max 1 GB), CPU default 0.5 (max 2), PidsLimit 256 |
| Security | `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges:true"]`, never `Privileged`, never bind mounts |
| Storage | optional named volume `rig-<name>-data` mounted at a path the user picks (default `/data`) |
| Env | decrypted just before create, never logged |

5. **Start:** poll `docker inspect` until running. Then HTTP GET
   `http://rig-<name>:<port>/` over `rig_apps`, allowing up to 60 seconds. If both
   pass, mark **running**. Otherwise mark **failed**, attach the last 50 log lines
   to the error, and leave the container stopped.
6. **Done:** Traefik picks up the label within a few seconds.

**Redeploy** means pull, create the new container as `rig-<name>-next`, wait for it
to be healthy, then stop and remove the old one and rename. If the new one fails,
keep the old one running.

**Delete** means stop, remove the container, and remove the named volume only if
Tobi ticks "Also delete data". Then delete the row.

## 6. Keeping things right (the reconciler)

On boot and every 30 seconds.
- List containers with the `rig.app_id` label and compare to the `apps` table.
  - **Row says running but the container is missing:** recreate it from the stored
    config and log an event.
  - **Container has no row:** leave it alone, but show it under "Unknown
    containers" so Tobi can decide.
- Status drifted: update it.
- Subscribe to the Docker events stream too, so crashes show up right away.
- After a reboot, Docker's `unless-stopped` brings containers back and the
  reconciler only confirms. **Test this for real.**

## 7. Custom domains

Stored in `apps.custom_domains` (text array, lowercase, unique across all apps).

- **Adding one:** validate (a hostname, not under `BASE_DOMAIN`, not claimed, not
  guarded), save, redeploy so the Traefik rule includes it, then show the two
  Cloudflare steps with Copy buttons.
- **Status pill:** every 5 minutes Rig fetches `https://<domain>/` from the
  outside. **Live** when the response carries `X-Rig-App: <name>`, which Traefik
  adds with a headers middleware on each app router. Anything else is **Waiting
  for DNS**, with a one-line hint.
- **Not in v1:** calling the Cloudflare API.

## 8. Secrets and settings

`.env` (Rig refuses to start and names the missing ones):

| Key | What |
|---|---|
| `BASE_DOMAIN` | `tobipi.dev` |
| `TUNNEL_TOKEN` | From the Cloudflare tunnel page |
| `SESSION_SECRET` | 32+ random bytes |
| `ENV_ENCRYPTION_KEY` | 32 random bytes, base64 (AES-256-GCM) |
| `POSTGRES_PASSWORD` | Random |
| `OWNER_EMAIL` | Tobi's login email |
| `GUARDED_DOMAINS` | `tobiolajide.com,oluwatobiolajide.com,madebytobi.com,tobiwashere.com` |

- **Registry credentials:** a settings screen stores a GHCR username and a
  read-only token (`read:packages`), encrypted. Passed as `authconfig` when
  pulling.
- **Never:** secrets in the repo, secrets in logs, a fallback secret, or env values
  sent back to the browser in full. Show the last 4 characters, and use a "Reveal"
  action that is logged as an event.

## 9. Cloudflare details that affect the code

- **Real visitor IP** is in `CF-Connecting-IP`. Use it for rate limiting and logs.
- **Live log streams (SSE):** Cloudflare closes idle connections after about 100
  seconds. Send `: ping` every 15 seconds. Also set `X-Accel-Buffering: no` and
  `Cache-Control: no-cache`.
- **Uploads:** the Free plan caps a request body at 100 MB.
- **Caching:** don't let Cloudflare cache `/api/*`. Send `Cache-Control: no-store`
  on API responses. Static assets can be cached with hashed filenames.
- **Dashboard login cookie:** `Secure`, `HttpOnly`, `SameSite=Lax`, scoped to
  `rig.tobipi.dev` only (no `Domain=`), so app subdomains can never read it.

## 10. Backups and updates

- **Backups:** `deploy/backup.sh` nightly from cron does `pg_dump` plus a tar of
  every `rig-*-data` volume, both to the external drive, keeping 14 days. Add
  `deploy/restore.md` with the exact restore commands, and test it once.
- **Updating Rig:** CI builds a multi-arch image on every push to `main` and pushes
  to GHCR. On the Pi, `docker compose pull && docker compose up -d`.
- **Updating an app:** push a new image tag, then Redeploy.

## 11. Testing without the Pi or Cloudflare

Run the stack locally with Traefik's `8080:80` uncommented and no cloudflared.
`curl -H "Host: hello.tobipi.dev" localhost:8080` should return the app.

Test cases:
- Deploy `nginxdemos/hello` and get 200 through Traefik.
- Stop it and get 404 or 502. Delete it and the route is gone.
- Two apps on different names don't collide.
- A custom domain routes with `Host: tobifm.com`.
- A redeploy that fails keeps the old container serving.
- An image with no arm64 version gets the clear error.
- App containers can't reach `postgres:5432` or `docker-proxy-rw:2375`.
- Every protected route returns 401 without a session.

## 12. Go-live checklist (on the Pi)

1. `https://rig.tobipi.dev` shows the login page with a valid certificate.
2. Deploy `nginxdemos/hello` as `hello`. `https://hello.tobipi.dev` works within a
   minute, from a phone on cellular data, not home wifi.
3. Logs stream live, and the stats update.
4. Deploy the AI DJ image as `dj` with a data volume, and add `tobifm.com`.
   `https://tobifm.com` and `https://dj.tobipi.dev` both work, and
   `www.tobifm.com` redirects.
5. `sudo reboot`. Everything comes back with no clicks.
6. Delete `hello`. The URL stops working.
7. The backup runs, and a test restore works.
