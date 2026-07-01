# Deploying DataFlow to a DigitalOcean Droplet

Run the full Compose stack on a single Droplet with automatic HTTPS. Only
ports 22, 80, and 443 are exposed; everything else stays on loopback.

> DataFlow is a POC. A single droplet gives you a demo/staging deployment —
> not HA, not managed backups. See [Production gaps](#production-gaps).

## Topology

```
Internet ──443──▶ Caddy (Let's Encrypt TLS)
                    └──▶ web nginx ──▶ /api ▶ Go API ──▶ Postgres / Redis / Temporal / ClickHouse
SSH tunnel ─────▶ 127.0.0.1: 4000 (API) · 8082 (Temporal UI) · 8025 (Mailhog)
```

The override at `deploy/droplet/docker-compose.droplet.yml` adds Caddy,
rebinds internal ports to `127.0.0.1`, and sets restart policies. Loopback
binding matters because Docker's iptables rules bypass UFW — the firewall
alone would not protect published ports.

## Sizing

| Size | Fits | Notes |
|---|---|---|
| `s-4vcpu-8gb` (default) | default stack + headroom | recommended |
| `s-2vcpu-4gb` | default stack, tight | relies on the 4 GB swap from cloud-init |
| `g-8vcpu-32gb`+ | `--profile ai` (Ollama) | 8B model needs ~6 GB by itself |

## Create a droplet

Prereqs: [doctl](https://docs.digitalocean.com/reference/doctl/how-to/install/)
authenticated (`doctl auth init`), an SSH key uploaded to DO
(`doctl compute ssh-key list`), and a domain you control.

```bash
./deploy/droplet/deploy.sh create \
  --domain dataflow.example.com \
  --ssh-key <doctl-ssh-key-id>
```

Then:

1. Point an **A record** for the domain at the printed droplet IP.
2. Wait for provisioning (~10 min):
   `ssh root@<ip> tail -f /var/log/cloud-init-output.log`
3. Open `https://dataflow.example.com`.

Cloud-init installs Docker + Compose, adds swap and UFW, clones the repo to
`/opt/dataflow`, runs `scripts/bootstrap.sh` (which generates all secrets and
the worker keypair on the droplet — nothing sensitive leaves the box), writes
`DATAFLOW_DOMAIN` to `.env`, and starts the stack. Caddy obtains the TLS
certificate on first request once DNS resolves.

## Update a running droplet

From your machine:

```bash
./deploy/droplet/deploy.sh update --host <ip> --ref main
```

Or from GitHub: the **Deploy to Droplet** workflow (`workflow_dispatch`) runs
the same update over SSH. Configure two repository secrets:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | droplet IP or hostname |
| `DROPLET_SSH_KEY` | private key matching the `--ssh-key` used at create time |

## Reaching internal services

Nothing but the UI is public. Tunnel to the rest:

```bash
ssh -N root@<ip> -L 8082:localhost:8082   # Temporal UI  → http://localhost:8082
ssh -N root@<ip> -L 8025:localhost:8025   # Mailhog      → http://localhost:8025
ssh -N root@<ip> -L 4000:localhost:4000   # API directly
```

For the observability profile (Grafana `3001`, Prometheus `9090`, Jaeger
`16686`), start it with `--profile observability` and tunnel the same way —
those ports are never published publicly by the base compose file on the
droplet.

## Operations

- **Logs** — `ssh root@<ip> 'cd /opt/dataflow && docker compose -f docker-compose.yml -f deploy/droplet/docker-compose.droplet.yml logs -f api'`
- **DB backup** — `scripts/db-backup.sh` on the droplet, plus DO droplet
  snapshots for a coarse full-machine restore point.
- **Email** — Mailhog captures mail but delivers nothing. For real email set
  `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM` in `/opt/dataflow/.env`
  and restart the api service.
- **OAuth** — Google/Microsoft SSO callbacks default to localhost; set the
  `*_REDIRECT_URI` values in `.env` to `https://<domain>/api/auth/...` and
  register them with the provider.

## Production gaps

Same list as the README's project status, plus droplet-specific ones: secrets
live in a plaintext `.env` (move to a KMS), single node (no failover),
`db-backup.sh` is manual (schedule it), and the `X-Forwarded-Proto` the API
sees is `http` because web's nginx overwrites Caddy's header — `APP_URL` is
overridden to the https domain, which covers link generation, but revisit
before anything relies on the raw header.
