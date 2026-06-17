# Deploying Vitalogy to Hetzner

Same pattern as `adorable`: build locally, `rsync` the artifacts to
`/opt/vitalogy/`, restart a systemd service, nginx fronts everything,
Cloudflare DNS points at the box.

```
Cloudflare (DNS only)  →  nginx (TLS, static SPA, /api/* reverse proxy)
                              │
                              ├─ /            → /opt/vitalogy/web (Angular SPA, SPA fallback)
                              └─ /api/*       → 127.0.0.1:3001 (NestJS via systemd)
                                                    │
                                                    └─ Postgres on localhost:5432
```

## One-time setup

### 1. Cloudflare DNS

Already done for `vitalogy.app`'s nameservers — your zone is on
Cloudflare. Add the records that point the domain at the Hetzner box:

1. Cloudflare dashboard → select `vitalogy.app` → **DNS / Records**
2. **Add record**: `Type=A`, `Name=@`, `IPv4=89.167.97.212`,
   **Proxy status: DNS only** (grey cloud — same as adorable.run).
   With the orange cloud Cloudflare would terminate TLS and certbot
   wouldn't be able to do the http-01 challenge.
3. **Add record**: `Type=A`, `Name=www`, `IPv4=89.167.97.212`, also
   **DNS only**.
4. Wait a minute or two and verify:
   ```bash
   dig +short vitalogy.app
   # → 89.167.97.212
   ```

### 2. Postgres database + role

Drop the SQL onto the server and run it as the postgres superuser.
**Edit the placeholder password first**.

```bash
scp deploy/postgres-setup.sql deploy@89.167.97.212:/tmp/
ssh deploy@89.167.97.212
# now on the box:
sudoedit /tmp/postgres-setup.sql    # set a real password
sudo -u postgres psql -f /tmp/postgres-setup.sql
rm /tmp/postgres-setup.sql
```

The password you set here also goes into `DATABASE_URL` in step 4.

### 3. Server filesystem + systemd

```bash
# On the server, as your normal user:
sudo mkdir -p /opt/vitalogy/{dist,web,prisma}
sudo chown -R deploy:deploy /opt/vitalogy
```

Copy the systemd unit + enable it:

```bash
# From the cycle-app repo on your laptop:
scp deploy/vitalogy.service deploy@89.167.97.212:/tmp/

# Then on the server:
sudo mv /tmp/vitalogy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vitalogy
# (don't start yet — needs .env + first deploy)
```

### 4. Production `.env`

```bash
# From the cycle-app repo:
scp deploy/env.production.example deploy@89.167.97.212:/tmp/

# On the server:
sudo mv /tmp/env.production.example /opt/vitalogy/.env
sudo chown deploy:deploy /opt/vitalogy/.env
sudo chmod 600 /opt/vitalogy/.env

# Edit and fill in every CHANGE_ME (DATABASE_URL password, JWT_SECRET,
# API_KEY_ENCRYPTION_SECRET, OAuth credentials):
sudoedit /opt/vitalogy/.env
```

Generate the secrets locally:

```bash
openssl rand -base64 48     # JWT_SECRET
openssl rand -base64 32     # API_KEY_ENCRYPTION_SECRET
```

### 5. nginx server block

```bash
scp deploy/nginx.conf deploy@89.167.97.212:/tmp/vitalogy

# On the server:
sudo mv /tmp/vitalogy /etc/nginx/sites-available/vitalogy
sudo ln -s /etc/nginx/sites-available/vitalogy /etc/nginx/sites-enabled/vitalogy
sudo nginx -t           # syntax check
sudo systemctl reload nginx
```

### 6. TLS with certbot

```bash
# On the server (only if certbot isn't already installed):
sudo apt install -y certbot python3-certbot-nginx

# Issue + auto-install the cert. Reads the server_name from the block
# above and rewrites it in-place to add the SSL block + 80→443 redirect.
sudo certbot --nginx -d vitalogy.app -d www.vitalogy.app

# Auto-renew is set up by the certbot package; verify with:
sudo systemctl list-timers | grep certbot
```

### 7. OAuth provider redirect URIs

Add these exact URLs to the respective consoles **before** first sign-in:

| Provider | Console | URL to add |
|---|---|---|
| Strava | https://www.strava.com/settings/api | Callback domain: `vitalogy.app` |
| Google | https://console.cloud.google.com/apis/credentials | Authorized redirect URI: `https://vitalogy.app/api/auth/google/callback` |

### 8. First deploy

From your laptop:

```bash
./deploy.sh
```

The script will:

1. Build `api` and `web` for production.
2. `rsync` the artifacts + `prisma/` + `package.json`/lock to `/opt/vitalogy/`.
3. SSH in, `npm ci --omit=dev`, `prisma generate`, `prisma migrate deploy`,
   `systemctl restart vitalogy`.

Verify:

```bash
curl https://vitalogy.app/api/health     # → "ok"
# Then open https://vitalogy.app in a browser.
```

## Recurring deploys

```bash
./deploy.sh
```

Same flow each time. Migrations apply automatically; nginx + systemd
config persists across deploys.

## Environment overrides

The script reads two env vars if you want to deploy elsewhere:

```bash
VITALOGY_DEPLOY_SSH=deploy@staging.example.com \
VITALOGY_DEPLOY_DIR=/opt/vitalogy-staging \
  ./deploy.sh
```

## Rollback

There's no built-in versioned-artifact directory yet — `dist/` is
mirrored in place. If you need to roll back, redeploy from a previous
commit (the migrations are forward-only; a true rollback would need
either a `prisma migrate resolve` step or a Postgres dump). For now,
mostly: deploy carefully, watch `journalctl -u vitalogy -f` after a
restart.

## Troubleshooting

```bash
# Tail the API server logs:
ssh deploy@89.167.97.212 'sudo journalctl -u vitalogy -f'

# Check the systemd unit's state:
ssh deploy@89.167.97.212 'systemctl status vitalogy'

# nginx access / error logs:
ssh deploy@89.167.97.212 'sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log'

# Postgres connection from the deploy user:
ssh deploy@89.167.97.212 'psql "postgresql://vitalogy:PASSWORD@localhost:5432/vitalogy" -c "select 1"'
```
