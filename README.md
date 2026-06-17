# Vitalogy

> Cycling-first training analytics — Strava import + first-party BLE sensor
> recording on iOS / Android + per-activity detail (laps, streams, GPS map,
> weather) + AI-assisted analysis (Anthropic Claude, Google Gemini).

Visual design follows the **VeloPulse** system: obsidian carbon-fiber surfaces,
electric-lime hero accents, Sora for metrics, Space Grotesk for tracked caps,
Inter for body. Glassmorphism cards throughout.

Set up as an [Nx](https://nx.dev) monorepo. Four apps share a single
TypeScript codebase and design system.

## Structure

```
apps/
  web/              Angular 21 SPA — Activities list, detail page (map,
                    charts, laps, weather), Strava import, AI analysis
  api/              NestJS 11 backend (user-id middleware, activities CRUD,
                    Strava OAuth + import, AI provider proxy)
  mobile/           Angular 21 + Capacitor (iOS / Android) — BLE sensor
                    recorder with live tiles, lap-marking, auto-pause,
                    GPS + weather + uploads
  simulator/        Desktop dev app — wraps the mobile record screen with
                    synthetic + replay drivers so you can iterate on UI
                    without deploying to the phone
  web-e2e/          Playwright tests for web
  api-e2e/          Jest e2e tests for api

libs/
  shared/
    data-models/    Plain-TS interfaces shared across all apps
  api/
    auth/           UserIdMiddleware + @UserId decorator (tier-1 tenancy)
    db/             PrismaService + DbModule (Postgres)
    strava/         OAuth, import, per-activity detail import, bulk loop
    ai/             Anthropic + Gemini services + AnalysisService + controller
    activities/     Activity read + upload (manual recordings)
  web/
    ui/             Shell, stream-chart, route-map
    feature-activities/  list + detail page (reused by mobile too)
    feature-import/      Strava connect + import controls
    feature-analysis/    AI analysis UI
  mobile/
    api-client/          ConfigService (apiBaseUrl + userId) + ApiClient
    ble/                 Capacitor BLE wrapper + sensor adapters
                         (HRM, CSC, Battery) + known-sensor store
    recording/           Recording session, upload queue, GPS tracker,
                         auto-pause
    weather/             Open-Meteo client with 5-min refresh
    dev-sim/             Synthetic + replay drivers used by apps/simulator
    feature-record/      Live record UI + speed gauge / speed ring /
                         bottom-nav components
    feature-history/     Past-session list (loads from /api/activities)
    feature-settings/    Sensors, backend, auto-pause, display config
prisma/
  schema.prisma     User, StravaAccount, Activity, Stream, Lap, ApiKey,
                    Analysis — Postgres via Prisma 6
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

The conversational coach (Profile → AI keys) lets users bring their own
provider keys. Those keys are stored encrypted at rest, so set
`API_KEY_ENCRYPTION_SECRET` to any long random string (`openssl rand -base64 48`
is fine). The server refuses to save a user key if this is unset.

### Authentication

Auth supports email/password + Google OAuth. JWT sessions live in an
httpOnly cookie (`vt_session`, 30-day expiry). Required env:

- `JWT_SECRET` — any long random string (`openssl rand -base64 48`).
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — OAuth 2.0 client from
  the [Google Cloud console](https://console.cloud.google.com/apis/credentials).
- `GOOGLE_REDIRECT_URI` — defaults to
  `http://localhost:3000/api/auth/google/callback`. Set the same value
  in the Google client's authorized redirect URIs.
- `AUTH_REQUIRED` — set to `true` in production to lock all endpoints
  behind auth. In dev, leave unset and the API falls back to the
  `dev-user` identity (so the mobile app + simulator keep working).

## Deployment

Production runs on a Hetzner box at `vitalogy.app`. See
[`deploy/README.md`](deploy/README.md) for the one-time server
provisioning (Postgres, nginx, certbot, systemd, Cloudflare DNS) and
the recurring deploy flow:

```bash
./deploy.sh    # build api + web, rsync, migrate, restart
```

## Running

```bash
npm run serve:api      # API on http://localhost:3000/api
npm run serve:web      # Web on http://localhost:4200, proxies /api → :3000
npm run serve:mobile   # Mobile in browser preview on http://localhost:4200 (next free port)
npm run serve:all      # web + api in parallel
```

The web app's `proxy.conf.json` forwards `/api/**` to the NestJS server during
development, so the browser doesn't need to know the API URL.

Health check: `curl http://localhost:3000/api/health`

## Mobile app

`apps/mobile` is an Angular app wrapped in Capacitor. It records cycling
sensor data over Bluetooth Low Energy: Wahoo TICKR (heart rate) + Blue SC
(speed/cadence), or any other sensor using the standard Bluetooth GATT
Heart Rate (0x180D) or Cycling Speed & Cadence (0x1816) profiles.

### Browser preview (no native build)

```bash
npm run serve:mobile
```

BLE scanning won't work in the browser (the Capacitor BLE plugin needs the
native runtime), but you can validate the UI layout, navigation, and
non-sensor flows.

### Build for iOS

```bash
# 1. One-time: install the native runtime and Pods
npm run build:mobile          # produces dist/apps/mobile/browser
cd apps/mobile && npx cap add ios
npm run cap:sync

# 2. Open in Xcode (requires Xcode installed)
npm run cap:open:ios
```

The committed `Info.plist` already includes the required permission strings
(Bluetooth + Location) and `bluetooth-central` + `location` background modes.
You only need to set the team + bundle identifier in Signing & Capabilities.

### Mobile → API uploads

Recordings auto-upload to the backend when you tap **Stop**. Two things you
need to set up before the first upload works:

1. **Backend reachable from the phone.** Find your Mac's LAN IP
   (`ipconfig getifaddr en0`) and put it in the app's Settings screen as
   <code>http://192.168.x.x:3000</code>. The API now listens on `0.0.0.0`,
   not just loopback, so the LAN IP works out of the box. For testing
   *away* from home WiFi, Tailscale is a great upgrade.

2. **User ID (optional).** Defaults to `dev-user` — same namespace as the
   web's Strava imports, so mobile rides show up at `/activities` alongside
   them. Change this in Settings only if you want this phone's rides in a
   separate namespace.

If the phone is offline when you tap Stop, the session is queued in
Capacitor Preferences and retried automatically next time the app opens (or
manually via the yellow "N rides pending upload" banner).

### Tier 1 user-id tenancy

The API reads `X-User-Id` from every request and scopes all queries to that
identity. The web app doesn't send the header → falls back to `dev-user`.
The mobile app sends whatever Settings has → defaults to `dev-user`.

This is **trust-the-client tenancy** — fine for a personal app on your home
network. The single piece of code to change for proper auth (Tier 2 shared
API key, Tier 3 Sign in with Apple) is
<code>libs/api/auth/src/lib/user-id.middleware.ts</code>.

### Build for Android

```bash
npm run build:mobile
cd apps/mobile && npx cap add android
npm run cap:sync
npm run cap:open:android
```

The plugin auto-declares `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` permissions
on API 31+. For background recording you'll need to declare and start a
foreground service.

### BLE adapter architecture

`libs/mobile/ble` is sensor-type-agnostic. Adding a new sensor (power meter,
trainer, Di2 shifters) is implementing a `SensorAdapter<TReading>` and
registering it in `ble-manager.service.ts`.

```ts
const HRM_ADAPTER: SensorAdapter<HrmReading> = {
  kind: 'HRM',
  name: 'Heart Rate Monitor',
  serviceUuid: SERVICE_UUIDS.HEART_RATE,           // 0x180D
  measurementCharacteristic: CHARACTERISTIC_UUIDS.HEART_RATE_MEASUREMENT,
  parse: (data: DataView) => /* per-spec decode */,
};
```

`CscTracker` maintains the cross-packet state (handling u16/u32 wrap) needed
to derive rpm and m/s from successive CSC notifications.

## Simulator (apps/simulator)

`apps/simulator` is a standalone Angular app (no Capacitor) that wraps the
mobile record screen in a phone-frame chrome and feeds it synthetic or
replay data instead of real BLE sensors. Useful for iterating on UI without
deploying to the phone.

```bash
npm run serve:simulator   # http://localhost:4200 (next free port)
```

Two drivers:

- **Synthetic** — generated HR / cadence / speed curves you can tweak from
  the sidebar.
- **Replay** — pick any of your previously uploaded activities from the
  backend and play it back. Includes a scrubber, play/pause, variable
  speed, and live timecodes.

Both drivers go through the same `SensorAdapter` interface the mobile app
uses, so the record-screen code stays identical between the two apps. The
simulator overrides `UploadQueue` with a no-op so dev replays don't spam
the database with duplicates.

## Key flows

- **Strava connect:** `GET /api/auth/strava/start` redirects to Strava; the
  callback persists tokens in `StravaAccount` and auto-upserts the User row.
- **Bulk import:** `POST /api/strava/import-recent` pulls the latest rides
  into `Activity`. Details (streams + laps) are loaded lazily on first
  detail-page visit, or eagerly via the "Import all missing details" button.
- **Activities:** `GET /api/activities`, `GET /api/activities/:id`,
  `POST /api/activities` (mobile uploads — JSON body with streams + laps).
- **Analysis:** `POST /api/analysis/run` (server-side SDK call) or
  `POST /api/analysis/export` (returns a prompt + JSON the user pastes
  into Claude/Gemini themselves).
- **Weather:** Open-Meteo (free, no key) — fetched on the record screen
  every 5 min based on current GPS.

### Recording UX (mobile)

- **Auto-pause** — configurable speed threshold (default 1 m/s) with a
  trailing window; paused segments are tracked separately so `durationSec`
  reflects moving time while `elapsedSec` is wall-clock.
- **Lap marking** — tap the lap button to split; the live "vs best" tile
  compares the current lap pace to the best lap of the ride.
- **Configurable tiles** — pick which metrics show on the record screen
  and switch between 2-column or 1-column "handlebar" mode in Settings.
- **Offline queue** — uploads retry next time the app opens; pending count
  shows in the lime banner.

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

## Design system — VeloPulse

Tokens live in each app's `styles.scss` and are kept in sync across web,
mobile, and simulator:

- **Colors** — `#0f0f0f` obsidian canvas, `#c3f400` electric lime accent,
  `#161e00` on-lime, `#c4c9ac` muted ink.
- **Typography** — Sora (display + metrics), Space Grotesk (tracked caps,
  small labels), Inter (body).
- **Surfaces** — `.velo-carbon` (twill weave), `.velo-glass` (frosted
  glassmorphism), `.velo-glow-lime` / `.velo-shadow-lime` for hero
  emphasis, `.velo-pulse` for the recording dot.
- **Bottom nav** — `.velo-bottom-tab` / `.velo-bottom-tab-active`
  (lime pill on the active route).
- **Drawer** — `.velo-drawer` / `.velo-backdrop` slide+fade animations.
- **Icons** — Material Symbols (outlined, variation-axis controlled).

Mobile shows a hamburger drawer + bottom tab nav (Ride / Activity /
Settings); web reuses the activities feature lib end-to-end. The mobile
activity-detail route lazy-loads the same `feature-activities` lib so the
phone WebView renders identical charts + map + laps + weather.

## Notes / known gotchas

- The workspace uses Nx 22's TS-references setup. Angular doesn't support it
  natively yet, so all Nx commands run with `NX_IGNORE_UNSUPPORTED_TS_SETUP=true`
  (already baked into the `serve:*` scripts). When that warning becomes
  redundant in a future Angular release, drop the env var.
- `apps/api` uses webpack (Nest's standard Nx setup) and bundles workspace libs.
- `apps/web` and `apps/simulator` use Angular's esbuild bundler.
- Prisma is pinned to v6 — Prisma 7 dropped the `url` field in `datasource`
  and requires a `prisma.config.ts` adapter setup. Upgrade when the docs catch up.
- User identity defaults to `dev-user` everywhere (web + mobile + simulator
  → API). Configure a different one in mobile Settings to namespace per phone.
  Replace `UserIdMiddleware` with real auth before sharing with anyone.
