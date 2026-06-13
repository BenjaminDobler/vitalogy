# Vitalogy

> Cycling-first training analytics — Strava import + per-activity detail (laps, streams, GPS map) + AI-assisted analysis (Anthropic Claude, Google Gemini).



A personal cycling-analytics workspace. Import rides (Strava today, first-party
recording later), explore the data in a modern Angular UI, and run AI-powered
analyses via Anthropic Claude and Google Gemini.

Set up as an [Nx](https://nx.dev) monorepo so additional apps and tools can be
added alongside the initial web + API.

## Structure

```
apps/
  web/              Angular 21 SPA (Tailwind + Angular CDK)
  api/              NestJS 11 backend
  web-e2e/          Playwright tests for web
  api-e2e/          Jest e2e tests for api
libs/
  shared/
    data-models/    Plain-TS interfaces shared by web + api
  api/
    db/             PrismaService + DbModule (Postgres)
    strava/         Strava OAuth + import
    ai/             Anthropic + Gemini services, AnalysisService, controller
    activities/     Activity read API
  web/
    ui/             Shell + shared UI primitives
    feature-activities/
    feature-import/
    feature-analysis/
prisma/
  schema.prisma     Database schema (User, StravaAccount, Activity, Stream, Lap, ApiKey, Analysis)
docker-compose.yml  Postgres 17 for local dev
```

## First-time setup

```bash
# 1. Install
npm install

# 2. Copy env template and fill in secrets
cp .env.example .env

# 3. Start Postgres
npm run db:up

# 4. Create the database schema
npm run prisma:migrate -- --name init
```

`.env` is git-ignored. The minimum to boot the API is `DATABASE_URL`. Strava
import needs `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` (create an app at
<https://www.strava.com/settings/api>). AI analysis needs `ANTHROPIC_API_KEY`
and/or `GEMINI_API_KEY` — leave both blank to fall back to the "export
prompt" mode.

## Running

```bash
npm run serve:api   # API on http://localhost:3000/api
npm run serve:web   # Web on http://localhost:4200, proxies /api → :3000
npm run serve:all   # both in parallel
```

The web app's `proxy.conf.json` forwards `/api/**` to the NestJS server during
development, so the browser doesn't need to know the API URL.

Health check: `curl http://localhost:3000/api/health`

## Key flows

- **Strava connect:** `GET /api/auth/strava/start` redirects to Strava; the
  callback persists tokens in `StravaAccount`.
- **Import:** `POST /api/strava/import-recent` pulls recent rides into
  `Activity` (currently throws `Not implemented` — wire up in
  `libs/api/strava/src/lib/strava.service.ts#importRecent`).
- **Activities:** `GET /api/activities`, `GET /api/activities/:id`.
- **Analysis:** `POST /api/analysis/run` (server-side SDK call) or
  `POST /api/analysis/export` (returns a prompt + JSON the user pastes
  into Claude/Gemini themselves).

The AI module supports three key modes (see `libs/shared/data-models/src/lib/ai.ts`):
- `SERVER` — uses env vars; default when keys are configured server-side.
- `USER` — uses keys stored encrypted in `ApiKey` per user (decrypt flow is TODO).
- `EXPORT` — never calls a provider; just returns the prompt for manual use.

## Useful commands

```bash
npx nx graph              # visualize project graph
npx nx affected -t build  # build only what changed
npx nx run-many -t test   # run all tests
npm run prisma:studio     # browse the database
```

## Notes / known gotchas

- The workspace uses Nx 22's TS-references setup. Angular doesn't support it
  natively yet, so all Nx commands run with `NX_IGNORE_UNSUPPORTED_TS_SETUP=true`
  (already baked into the `serve:*` scripts). When that warning becomes
  redundant in a future Angular release, drop the env var.
- `apps/api` uses webpack (Nest's standard Nx setup) and bundles workspace libs.
- `apps/web` uses Angular's esbuild bundler.
- Prisma is pinned to v6 — Prisma 7 dropped the `url` field in `datasource`
  and requires a `prisma.config.ts` adapter setup. Upgrade when the docs catch up.
- `DEV_USER_ID = 'dev-user'` is hardcoded in the controllers as a stand-in
  for real auth. Replace with a proper auth flow before sharing with anyone.
