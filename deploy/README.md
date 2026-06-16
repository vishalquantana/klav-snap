# Deploying Klav to `klav.quantana.top` (1 GB Vultr)

Serves the Bun prototype (the live core-loop demo: `/`, `/home`, `/onboarding`) behind
Caddy with automatic HTTPS. The box is a stateless proxy to OpenRouter — 1 GB is comfortable.

## 0. DNS (do this first, it propagates while you set up)

Add an **A record**: `klav.quantana.top → <SERVER_IP>` (proxy off / "DNS only").
Caddy needs the name to resolve to the box to issue the Let's Encrypt cert.

## 1. Base box (as root)

```bash
apt update && apt -y upgrade
apt -y install git ufw
adduser --disabled-password --gecos "" klav
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Install Bun (as the klav user)

```bash
su - klav
curl -fsSL https://bun.sh/install | bash
~/.bun/bin/bun --version   # confirm; note the path for the systemd unit
exit
```

## 3. Clone + first deploy (as klav)

```bash
su - klav
curl -fsSL https://raw.githubusercontent.com/vishalquantana/klav-snap/master/deploy/deploy.sh -o deploy.sh
bash deploy.sh        # clones into /opt/klav (service restart is skipped until step 5)
exit
```

## 4. Secret (as root)

```bash
mkdir -p /etc/klav
cp /opt/klav/deploy/klav.env.example /etc/klav/klav.env
nano /etc/klav/klav.env          # paste the real OPENROUTER_API_KEY
chown klav:klav /etc/klav/klav.env && chmod 600 /etc/klav/klav.env
```

## 5. systemd service (as root)

```bash
cp /opt/klav/deploy/klav.service /etc/systemd/system/klav.service
# edit ExecStart to match `which bun` for the klav user if it differs from /home/klav/.bun/bin/bun
systemctl daemon-reload && systemctl enable --now klav
systemctl status klav --no-pager        # should be active (running)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4317/   # → 200
```

## 6. Caddy (TLS + reverse proxy, as root)

```bash
apt -y install debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy
cp /opt/klav/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Visit **https://klav.quantana.top** — Caddy auto-issues the cert on first request.

## 7. Lock down the public demo (strongly recommended)

It's a public URL on a **paid** API key. Before sharing:
- **Gate it:** `caddy hash-password --plaintext 'somepass'`, paste into the `basic_auth` block in `/etc/caddy/Caddyfile`, `systemctl reload caddy`.
- **Cap spend:** set a hard monthly credit limit on the OpenRouter key.
- Optional: switch `KLAV_MODEL` to `anthropic/claude-haiku-4.5` for the cheapest demo reactions.

## Updating later

```bash
su - klav -c 'bash /opt/klav/deploy/deploy.sh'   # pull + restart
```

## Logs

```bash
journalctl -u klav -f          # app
journalctl -u caddy -f         # TLS / proxy
```
