# Putting Rig on the Pi

The one-time setup, in order. Everything here is done by hand once; after it,
`./deploy/rig.sh up` is the only command you need.

The gap between this repo and `docs/HOSTING.md` is tracked in `STATUS.md`.

---

## 1. The Pi

Install 64-bit Raspberry Pi OS Lite. **Boot from an SSD** (NVMe HAT or USB), not
the SD card: Docker writes constantly and SD cards wear out.

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"      # log out and back in
```

Turn on log rotation so one noisy app cannot fill the disk:

```sh
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
JSON
sudo systemctl restart docker
```

## 2. Cloudflare

Add `tobipi.dev` and `tobifm.com` to the same Cloudflare account on the Free
plan, and switch the nameservers at the registrar.

## 3. The tunnel

In the Cloudflare dashboard, **Networking** then **Tunnels** (older dashboards
put this under Zero Trust, at `one.dash.cloudflare.com`):

1. **Create a tunnel**, connector type **Cloudflared**, name it `rig`.
2. The install page shows a command per operating system. The token is the long
   `eyJ...` string inside it. Copy the token only; you do not need to run the
   command, because Compose runs cloudflared for you.
3. On the tunnel's **Routes** tab, **Add route**, type **Published application**
   (older dashboards call this a **Public Hostname**). Add these, all pointing at
   the same service:

   | Subdomain | Domain | Service |
   |---|---|---|
   | `rig` | tobipi.dev | `http://traefik:80` |
   | `*` | tobipi.dev | `http://traefik:80` |
   | (blank) | tobifm.com | `http://traefik:80` |
   | `www` | tobifm.com | `http://traefik:80` |

   The service address is written from cloudflared's point of view, and
   cloudflared is a container beside Traefik. That is why it is `traefik:80` and
   not `localhost`.

   **Do not** use a private network route. Those take a CIDR and are for WARP
   devices reaching internal IPs, which is the opposite of what this needs.

4. **Check the DNS.** Under **DNS** then **Records**, `tobipi.dev` needs proxied
   (orange cloud) CNAMEs for `rig` and for `*`, both pointing at
   `<tunnel-id>.cfargotunnel.com`. Cloudflare usually creates the specific one
   and often misses the wildcard, so add it by hand if it is not there. Without
   the wildcard, no app will ever resolve.

5. Add a redirect rule sending `www.tobifm.com/*` to `https://tobifm.com/$1`
   with a 301.

## 4. Settings

```sh
git clone https://github.com/tobibytes/deploy-hub.git
cd deploy-hub
cp deploy/.env.example deploy/.env

openssl rand -base64 48    # SESSION_SECRET
openssl rand -base64 32    # ENV_ENCRYPTION_KEY
openssl rand -base64 24    # POSTGRES_PASSWORD

nano deploy/.env           # paste those, plus BASE_DOMAIN, OWNER_EMAIL,
                           # OWNER_PASSWORD and TUNNEL_TOKEN
./deploy/rig.sh check      # confirms nothing is missing before the first run
```

`deploy/.env` holds real credentials and is ignored by git. Keep a copy of
`ENV_ENCRYPTION_KEY` somewhere safe: without it, every stored app environment
value becomes unreadable.

## 5. Start

```sh
./deploy/rig.sh up
```

Then open `https://rig.tobipi.dev`, sign in, and **clear `OWNER_PASSWORD` from
`deploy/.env`**. Change the password later with `./deploy/rig.sh create-owner`.

Running `up` again is always safe: migrations, the network and the owner account
are only applied if they are needed.

## 6. Backups

Nightly, keeping 14 days, onto a drive that is not the SD card:

```sh
crontab -e
# 15 3 * * * RIG_BACKUP_DIR=/mnt/usb/rig-backups /home/pi/rig/deploy/backup.sh >> /home/pi/rig/deploy/backup.log 2>&1
```

Run `./deploy/rig.sh backup` once by hand first, and confirm the file appears.

---

## Day to day

```sh
./deploy/rig.sh up              # start, or update to the latest image
./deploy/rig.sh status          # what is running, plus the health check
./deploy/rig.sh logs rig        # follow the logs
./deploy/rig.sh restart         # restart just Rig
./deploy/rig.sh create-owner    # change your password
./deploy/rig.sh backup          # write a database dump now
./deploy/rig.sh down            # stop, keeping the database
```

## Testing from your laptop first

The same tunnel can point at a laptop instead of the Pi, which is worth doing
before the hardware exists:

```sh
./scripts/dev.sh                 # the stack, minus cloudflared
./scripts/infra.sh tunnel        # add cloudflared, using TUNNEL_TOKEN
./scripts/infra.sh tunnel-down   # stop it again
```

**Only one machine may run a given tunnel at a time.** If the Pi is already
running it, traffic is shared between the two and nothing behaves predictably.

In development the dashboard runs on the host rather than as a container, so
Traefik has no route for `rig.tobipi.dev` and it answers 404. That is deliberate:
the development password is well known, and the wildcard is public.

## When something is wrong

| What you see | What it means |
|---|---|
| **Error 1033** on an app URL | Cloudflare found the hostname but no cloudflared is connected. Check `./deploy/rig.sh logs cloudflared` |
| **Error 1016** | The DNS record points at a tunnel that no longer exists |
| **404 from Traefik** | The tunnel is fine; Traefik has no route for that hostname. The app is probably stopped |
| **502 from Traefik** | The route exists but the container is not answering on the port you gave it |
| A subdomain does not resolve at all | The wildcard DNS record is missing. See step 3.4 |
| `./deploy/rig.sh` hangs | Docker is half up. The scripts give it ten seconds and then say so |
