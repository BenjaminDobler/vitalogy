#!/usr/bin/env bash
# Build + ship vitalogy to the Hetzner box. Mirrors the adorable
# deployment pattern: build locally, rsync artifacts, run the
# remote install / migrate / restart over SSH.
#
# One-time server setup is documented in deploy/README.md.

set -euo pipefail

SERVER="${VITALOGY_DEPLOY_SSH:-deploy@89.167.97.212}"
REMOTE_DIR="${VITALOGY_DEPLOY_DIR:-/opt/vitalogy}"

cd "$(dirname "$0")"

echo "▸ Building api + web for production…"
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build api --configuration=production
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build web --configuration=production

echo "▸ Syncing build artifacts to ${SERVER}:${REMOTE_DIR}/…"
# API bundle (Nest+webpack output — main.js + any chunks).
rsync -avz --delete \
  dist/apps/api/ \
  "${SERVER}:${REMOTE_DIR}/dist/apps/api/"

# Static SPA. Angular esbuild puts it under dist/apps/web/browser/.
# nginx serves /opt/vitalogy/web/index.html, so flatten the path here.
rsync -avz --delete \
  dist/apps/web/browser/ \
  "${SERVER}:${REMOTE_DIR}/web/"

# Prisma schema + migrations — needed for `prisma migrate deploy`.
rsync -avz --delete \
  prisma/ \
  "${SERVER}:${REMOTE_DIR}/prisma/"

# package.json + lock for `npm ci --omit=dev` to install runtime deps.
rsync -avz \
  package.json package-lock.json \
  "${SERVER}:${REMOTE_DIR}/"

echo "▸ Installing prod deps + migrating + restarting…"
ssh "${SERVER}" "set -e
  cd ${REMOTE_DIR}
  npm ci --omit=dev --no-audit --no-fund
  npx prisma generate
  npx prisma migrate deploy
  sudo systemctl restart vitalogy
"

echo "✓ Deployed. Check: https://vitalogy.app/api/health"
