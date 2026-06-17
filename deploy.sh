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
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build api
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build web --configuration=production

echo "▸ Ensuring remote directories exist…"
ssh "${SERVER}" "mkdir -p ${REMOTE_DIR}/dist/apps/api ${REMOTE_DIR}/web ${REMOTE_DIR}/prisma ${REMOTE_DIR}/libs/api ${REMOTE_DIR}/libs/shared ${REMOTE_DIR}/apps/api"

echo "▸ Syncing build artifacts to ${SERVER}:${REMOTE_DIR}/…"
# Nest+webpack writes to apps/api/dist/main.js (configured via the
# `cwd: "apps/api"` in the build target).
rsync -avz --delete \
  apps/api/dist/ \
  "${SERVER}:${REMOTE_DIR}/dist/apps/api/"

# Static SPA. Angular esbuild puts it under dist/apps/web/browser/.
rsync -avz --delete \
  dist/apps/web/browser/ \
  "${SERVER}:${REMOTE_DIR}/web/"

# Prisma schema + migrations.
rsync -avz --delete \
  prisma/ \
  "${SERVER}:${REMOTE_DIR}/prisma/"

# Workspace libs. The api bundle externalizes them as require('db') /
# require('data-models') / etc; npm install on the server resolves
# those via workspace symlinks → libs/<scope>/<name>. Each lib's
# package.json points main → ./dist/index.js so the built lib code
# has to ship with it.
# Only api + shared scopes are needed at runtime — mobile/web scope
# libs are bundled into their respective apps and excluded here.
rsync -avz --delete \
  libs/api/ "${SERVER}:${REMOTE_DIR}/libs/api/"
rsync -avz --delete \
  libs/shared/ "${SERVER}:${REMOTE_DIR}/libs/shared/"

# Stub apps/api/package.json so npm workspaces (apps/*) doesn't
# complain about a missing workspace root. The actual built artifact
# is in dist/apps/api/main.js, not here.
rsync -avz \
  apps/api/package.json \
  "${SERVER}:${REMOTE_DIR}/apps/api/"

# Root package.json + lock for `npm install --omit=dev`.
rsync -avz \
  package.json package-lock.json \
  "${SERVER}:${REMOTE_DIR}/"

echo "▸ Installing prod deps + migrating + restarting…"
ssh "${SERVER}" "set -e
  cd ${REMOTE_DIR}
  # npm install (not npm ci) so platform-specific optional deps can be
  # resolved on linux from a lockfile generated on macOS.
  npm install --omit=dev --no-audit --no-fund
  npx prisma generate
  npx prisma migrate deploy
  sudo systemctl restart vitalogy
"

echo "✓ Deployed. Check: https://vitalogy.app/api/health"
