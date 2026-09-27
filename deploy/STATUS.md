# Status against the hosting guide

What the repo does today, measured against `docs/HOSTING.md`. Written before any
of the hosting-guide work started, so it is a record of the starting point.

Legend: **Done** / **Partly** / **Missing**.

---

## 1. The big picture

| Item | State | Notes |
|---|---|---|
| cloudflared to Traefik to apps, no open ports | **Done** | `deploy/compose.yml` |
| Traefik routes by Docker label | **Done** | `apps/api/src/docker/labels.ts` |
| Rig reaches Docker only through a proxy | **Partly** | One proxy shared by Rig and Traefik, not the ro/rw split |
| Postgres for Rig's own data | **Done** | |

## 2. Domains

| Item | State | Notes |
|---|---|---|
| Base domain from the environment | **Partly** | The variable is `APP_DOMAIN`, not `BASE_DOMAIN`, and it **defaults to `tobiolajide.com`** in `config.ts`. That default is a hard-coded domain and has to go: the guide says the value is required and the domain appears only in docs and tests |
| One level of subdomain | **Done** | `checkAppName` accepts a single DNS label |
| Name format | **Partly** | Currently 3 to 32 characters and may start with a digit. The guide says **2 to 32, starting with a letter** |
| Reserved names | **Partly** | The list is a superset of the guide's, but **`status` is missing**, and it **wrongly reserves `dj`** — which the guide needs as a real app |
| `.dev` is HTTPS only | **Done** | No code impact |

## 3. What Tobi does by hand

| Item | State | Notes |
|---|---|---|
| `deploy/README.md` checklist | **Missing** | The steps are in the root `README.md` and describe the old domain. They also omit SSD boot, `daemon.json` log rotation, the second zone, and the `www` redirect rule |

## 4. Compose shape

| Item | State | Notes |
|---|---|---|
| `docker-proxy-ro` for Traefik | **Missing** | Traefik currently shares Rig's read/write proxy, so a Traefik compromise reaches a socket that can create containers |
| `docker-proxy-rw` for Rig | **Partly** | Exists, but grants `VOLUMES: 0` and does not set `ALLOW_START` / `ALLOW_STOP` / `ALLOW_RESTARTS` |
| `socket-ro`, `socket-rw`, `db` all internal | **Partly** | One `internal` network carries Rig, Postgres and the proxy together |
| Traefik trusts cloudflared's forwarded headers | **Missing** | No `forwardedHeaders.trustedIPs` |
| Traefik access log | **Missing** | `--accesslog=false` |
| App containers cannot reach Postgres or the proxy | **Done** | Apps are on `rig_apps`, which only Traefik shares |

## 5. Creating an app

| Item | State | Notes |
|---|---|---|
| Validate name, port, env keys | **Done** | `packages/shared/src/schemas.ts` |
| Arch check **before** pulling | **Partly** | Rig pulls with an explicit platform and turns the failure into a clear message. The guide wants the manifest inspected first |
| Pull progress into the event log | **Partly** | Progress goes to an in-memory view the dashboard polls; it is not written to the `events` table |
| Private registry credentials | **Missing** | No `authconfig`, no settings screen |
| Container name, network, no host ports, labels, restart, limits | **Done** | Covered by 13 tests in `labels.test.ts` |
| `CapDrop: ["ALL"]` | **Partly, and a deliberate deviation** | Rig drops all and **adds back eight** (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `FSETID`, `KILL`, `NET_BIND_SERVICE`, `SETGID`, `SETUID`). Dropping everything with no add-back breaks ordinary web images, `nginxdemos/hello` included, because nginx cannot hand its workers to an unprivileged user. See the question at the end |
| `no-new-privileges:true` | **Partly** | Set as `no-new-privileges` without `:true`. Docker accepts the bare form, but the explicit one is what the guide asks for |
| Named data volume | **Missing** | No volume support at all. Needed for AI DJ |
| Env decrypted late, never logged | **Done** | AES-256-GCM, decrypted in `deployInBackground` |
| Wait until running | **Done** | `waitUntilRunning`, 15 seconds |
| **HTTP GET the app over `rig_apps`, up to 60s** | **Missing** | Rig marks an app running as soon as the container runs, so an app that starts and then fails to serve still shows green |
| Failed deploy attaches the last 50 log lines | **Missing** | Only the error message is stored |
| Zero-downtime redeploy (`-next`, then rename) | **Missing** | Redeploy removes the old container first, so there is a gap, and a failed pull leaves nothing running |
| Delete offers to keep or remove data | **Missing** | No volumes yet |

## 6. Reconciler

| Item | State | Notes |
|---|---|---|
| On boot and every 30 seconds | **Done** | `reconciler.ts` |
| Status drift corrected | **Done** | |
| Row running, container missing, **recreate it** | **Partly** | Rig marks it stopped and asks the person to redeploy, rather than recreating |
| Container with no row: **leave alone, list as unknown** | **Partly, and the opposite of the guide** | Rig **removes** orphans. That is wrong under the new rules and will delete a container Tobi started by hand |
| Docker events subscription | **Missing** | 30 second polling only, so a crash can take that long to show |
| Reboot test | **Missing** | Never run on real hardware |

## 7. Custom domains

**Missing** in full: no `custom_domains` column, no validation, no guarded-domain
list, no `||  Host(...)` rule, no `X-Rig-App` header middleware, no status pill,
no outside-in check.

## 8. Secrets and settings

| Item | State | Notes |
|---|---|---|
| Refuses to start and names what is missing | **Done** | `config.ts` collects every problem |
| `SESSION_SECRET`, `ENV_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `OWNER_EMAIL`, `TUNNEL_TOKEN` | **Done** | |
| `BASE_DOMAIN` | **Partly** | Named `APP_DOMAIN` and has a default |
| `GUARDED_DOMAINS` | **Missing** | |
| Registry credentials | **Missing** | |
| No secret in the repo, no fallback secret, none in logs | **Done** | |
| Env values shown as last 4 characters, Reveal logged | **Partly** | The dashboard hides values behind an eye toggle, but the API returns them in full and a reveal is not recorded |

## 9. Cloudflare details

| Item | State | Notes |
|---|---|---|
| `CF-Connecting-IP` for rate limiting | **Partly** | Uses `request.ip` with `trustProxy`, which reads `X-Forwarded-For`. Works behind cloudflared but is not the header the guide names |
| SSE comment every 15 seconds | **Partly** | Every 25 seconds. Under Cloudflare's ~100s idle limit, so it works, but not what the guide says |
| `X-Accel-Buffering: no`, `Cache-Control: no-cache` on the stream | **Done** | |
| `Cache-Control: no-store` on API responses | **Missing** | Only the SSE route sets caching headers |
| 100 MB body cap | **Done** | Rig's own limit is 1 MB |
| Cookie `Secure`, `HttpOnly`, `SameSite=Lax`, no `Domain=` | **Done** | Never sets `Domain`, so it cannot leak to an app subdomain |
| Hashed static assets cached hard | **Done** | `immutable` on `/assets/`, `no-cache` on the page |

## 10. Backups and updates

| Item | State | Notes |
|---|---|---|
| Nightly `pg_dump`, 14 days | **Done** | `deploy/backup.sh`, verifies the gzip before pruning |
| Tar of every `rig-*-data` volume | **Missing** | No volumes yet |
| `deploy/restore.md`, tested once | **Missing** | |
| CI multi-arch image to GHCR | **Done** | `.github/workflows/ci.yml` |
| `docker compose pull && up -d` | **Done** | `deploy/rig.sh up` |

## 11. Tests

| Case | State |
|---|---|
| Deploy an image and get 200 through Traefik | **Done** (`scripts/smoke.sh`) |
| Delete it and the route is gone | **Done** |
| Stop it and get 404 or 502 | **Missing** |
| Two apps do not collide | **Missing** |
| A custom domain routes | **Missing** |
| A failed redeploy keeps the old container serving | **Missing** |
| An image with no arm64 build gives the clear error | **Partly** — the message is unit-tested, the path is not |
| An app container cannot reach Postgres or the proxy | **Missing** |
| Every protected route returns 401 | **Done** — 17 routes |

## 12. Go-live checklist

**Missing** as a document. Nothing has run on real hardware.

---

## The order of work

From section 13 of the guide. Stop and show after 2, 5 and 7.

1. Socket proxy split and the internal networks
2. The full container config from section 5 ← **stop and show**
3. `BASE_DOMAIN` everywhere
4. Health-checked deploys and zero-downtime redeploy
5. Reconciler plus the Docker events subscription ← **stop and show**
6. Named data volumes
7. Custom domains and the status pill ← **stop and show**
8. The Cloudflare details in section 9
9. Backups, then `deploy/README.md`

## One question before item 2

Section 5 says `CapDrop: ["ALL"]` with nothing added back. Rig currently adds
eight capabilities back, on purpose: with a bare drop-all, `nginxdemos/hello` —
the image in the guide's own go-live checklist — fails to start, because nginx
runs as root and cannot hand its workers to the `nginx` user without `SETUID` and
`SETGID`. The same applies to most images that drop privileges on startup.

Three ways to go:

- **Keep the add-back list** (what Rig does now). Ordinary web images work. The
  dangerous capabilities — raw sockets, kernel modules, device nodes, admin —
  stay gone.
- **Bare drop-all**, and accept that images which drop privileges need a
  `user:` override or an image that already runs unprivileged.
- **Bare drop-all by default, with a per-app switch** to add the eight back, off
  unless asked for.

Say which and item 2 follows it. Until then the current behaviour stands, and it
is covered by tests in `apps/api/src/docker/labels.test.ts`.
