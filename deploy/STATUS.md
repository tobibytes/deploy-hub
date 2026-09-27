# Status against the hosting guide

What the repo does today, measured against `docs/HOSTING.md`.

**Items 1 and 2 of the order of work are done**, along with two safety fixes that
could not wait for their turn. Everything below reflects the state after that.

Legend: **Done** / **Partly** / **Missing**.

---

## 1. The big picture

| Item | State | Notes |
|---|---|---|
| cloudflared to Traefik to apps, no open ports | **Done** | `deploy/compose.yml` |
| Traefik routes by Docker label | **Done** | `apps/api/src/docker/labels.ts` |
| Rig reaches Docker only through a proxy | **Done** | Two proxies: read-only for Traefik, managed for Rig |
| Postgres for Rig's own data | **Done** | |

## 2. Domains

| Item | State | Notes |
|---|---|---|
| Base domain from the environment | **Done** | `BASE_DOMAIN`, required, with no default. A default would itself be a hard-coded domain |
| One level of subdomain | **Done** | `checkAppName` accepts a single DNS label |
| Name format | **Done** | 2 to 32 characters, must start with a letter |
| Reserved names | **Done** | The guide's list plus a few more. `status` added, `dj` removed |
| `.dev` is HTTPS only | **Done** | No code impact |

## 3. What Tobi does by hand

| Item | State | Notes |
|---|---|---|
| `deploy/README.md` checklist | **Done** | SSD boot, log rotation, both zones, the tunnel steps with the CIDR trap called out, the wildcard record Cloudflare misses, and the `www` redirect |

## 4. Compose shape

| Item | State | Notes |
|---|---|---|
| `docker-proxy-ro` for Traefik | **Done** | `POST: 0`, `IMAGES: 0`, `VOLUMES: 0`. Verified: `GET /version` answers 200, `POST /containers/create` answers 403 |
| `docker-proxy-rw` for Rig | **Done** | Adds `VOLUMES`, `ALLOW_START`, `ALLOW_STOP`, `ALLOW_RESTARTS`. Everything else refused, listed once in a YAML anchor so neither proxy drifts |
| `socket-ro`, `socket-rw`, `db` all internal | **Done** | Three separate internal networks. Rig is on `web`, `socket-rw` and `db`; Traefik on `edge`, `web`, `apps` and `socket-ro` |
| Traefik trusts cloudflared's forwarded headers | **Done** | `--entrypoints.web.forwardedHeaders.trustedIPs=172.16.0.0/12` |
| Traefik access log | **Done** | `--accesslog=true` |
| App containers cannot reach Postgres or the proxy | **Done** | Apps are on `rig_apps`, which only Traefik shares. Proved in `scripts/smoke.sh`: both probes answer 000 from inside an app |

## 5. Creating an app

| Item | State | Notes |
|---|---|---|
| Validate name, port, env keys | **Done** | `packages/shared/src/schemas.ts` |
| Arch check **before** pulling | **Partly** | Rig pulls with an explicit platform and turns the failure into a clear message. The guide wants the manifest inspected first |
| Pull progress into the event log | **Partly** | Progress goes to an in-memory view the dashboard polls; it is not written to the `events` table |
| Private registry credentials | **Missing** | No `authconfig`, no settings screen |
| Container name, network, no host ports, labels, restart, limits | **Done** | Covered by 13 tests in `labels.test.ts` |
| `CapDrop: ["ALL"]` | **Done, with a deliberate deviation** | Rig drops all and **adds back eight** (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `FSETID`, `KILL`, `NET_BIND_SERVICE`, `SETGID`, `SETUID`). See the note at the end |
| `no-new-privileges:true` | **Done** | The explicit form, pinned by a test |
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
| Container with no row: **leave alone, list as unknown** | **Done** | Left running, listed at `GET /api/unknown-containers`. The interface for them comes with item 5 |
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
| `BASE_DOMAIN` | **Done** | Required, no default |
| `GUARDED_DOMAINS` | **Partly** | Read and parsed into `config.guardedDomains`. Nothing consumes it until custom domains land in item 7 |
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
| An app container cannot reach Postgres or the proxy | **Done** |
| Every protected route returns 401 | **Done** — 19 routes |

## 12. Go-live checklist

**Partly.** The checklist itself is now `deploy/README.md`. Nothing has run on the
Pi, but steps 1, 2 and 6 were verified from a laptop against the real domain: an
app deployed through the dashboard answered 200 over the tunnel with a valid
certificate, and stopped answering when deleted.

---

## The order of work

From section 13 of the guide. Stop and show after 2, 5 and 7.

1. ~~Socket proxy split and the internal networks~~ **done**
2. ~~The full container config from section 5~~ **done** ← stopped here
3. ~~`BASE_DOMAIN` everywhere~~ **done** (needed before anything could be tested
   against the real domain)
4. Health-checked deploys and zero-downtime redeploy
5. Reconciler plus the Docker events subscription ← **stop and show**
6. Named data volumes
7. Custom domains and the status pill ← **stop and show**
8. The Cloudflare details in section 9
9. ~~Backups, then `deploy/README.md`~~ **partly**: the checklist is written, the
   volume tar and `restore.md` wait on item 6

Two things were pulled forward, because leaving them would have been worse than
keeping the order:

- **The reconciler no longer removes containers it does not recognise.** The old
  behaviour would have deleted a container started by hand, which is the one
  mistake here that cannot be undone.
- **`dj` is no longer a reserved name**, because the guide needs it as a real app.

## A deviation, with the evidence

Section 5 asks for `CapDrop: ["ALL"]` and nothing added back. Rig adds eight
capabilities back. Tested directly:

```
nginxdemos/hello --cap-drop ALL            exited (1)
  nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed
         (1: Operation not permitted)

nginxdemos/hello --cap-drop ALL + the eight   running
```

`nginxdemos/hello` is the image in the guide's own go-live checklist, and nginx
cannot hand its workers to an unprivileged user without `SETUID` and `SETGID`.
The capabilities that matter are still gone: raw sockets, kernel modules, device
nodes and admin. The list is in `apps/api/src/docker/labels.ts`, covered by tests.

Say so and it becomes a bare drop-all, or a per-app switch, in an afternoon.

