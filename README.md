# Eisenhower Matrix

A local-first priority matrix for personal tasks. Two axes (importance and urgency) place every task in one of four quadrants, with continuous 0–100 scores and a configurable threshold.

The app is a single-user local full stack: React + Vite in the browser, Hono + SQLite on the server. No account, no cloud, no telemetry.

## Features

- **Matrix view**: important tasks render as cards, unimportant tasks as dots, nearby dots collapse into a cluster bubble.
- **No drag-to-reposition**: scores change only through the detail panel (sliders / number inputs) or keyboard nudging. The matrix reflows automatically.
- **Pending review**: a task exactly on the threshold (`50 / 50` by default) is shown as a neutral pending card and excluded from quadrant counts.
- **Scores**: integers 0–100. Decimals are rounded and values are clamped on both the client and the server.
- **Threshold**: adjustable from 30 to 70, default 50.
- **Organization**: due dates with overdue/today/soon states, tags, title/notes search, tag filtering (OR).
- **Quadrant focus**: pick a quadrant from the top bar, or click its label on the matrix, to see all of its tasks with a List/Map toggle. Map keeps the spatial importance/urgency layout.
- **Calendar**: week view with read-only ICS subscriptions/imports, task time blocks, a separate Due column, and overlap highlighting.
- **Views**: In progress matrix; Completed and Archived lists.
- **Undo**: completing or archiving a task shows a 5-second undo toast.
- **Keyboard**: `n` adds a task, `/` focuses search, `Esc` closes overlays, arrow keys nudge a focused card/dot (Shift for ±10).
- **Themes**: Graphite (dark) and Fog (soft gray), persisted in SQLite.
- **Backup**: `npm run backup` writes a consistent SQLite backup with a timestamp.

## Requirements

- Node.js 24+
- npm 11+
- macOS, Linux, or Windows (SQLite is bundled through `better-sqlite3`)

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The app starts with an empty database.

Optional demo data:

```bash
npm run seed
```

The seed command is never run automatically and is skipped if active tasks already exist.

- Web dev server: `http://localhost:5173` (Vite proxies `/api` to `http://127.0.0.1:3001`)
- API: `http://127.0.0.1:3001`

## Production

```bash
npm run build
npm start
```

Open http://127.0.0.1:3001. The Hono server serves the built frontend and the API from the same origin.

## macOS launcher

Create double-clickable apps in `~/Applications`, so you never need a terminal or VS Code to use the app:

```bash
npm run app:install
```

- **Eisenhower Matrix** — starts the production server in the background if it is not already running, then opens http://127.0.0.1:3001. Clicking it again simply opens the page.
- **Eisenhower Matrix Stop** — stops the background server.

Drag **Eisenhower Matrix** from `~/Applications` to the Dock. The first launch may take a few seconds while the web app is built. Logs are written to `data/server.log`.

To stop it from a terminal instead: `npm run app:stop`.

## GitHub Pages (static)

`.github/workflows/deploy-pages.yml` builds a static version and deploys it to GitHub Pages on every push to `main`.

The Pages build stores data in the browser instead of using the API/SQLite server:

- Data lives in `localStorage` under `eisenhower-matrix.v1` in the current browser.
- There is no cross-device sync, server backup, or automatic migration of the local SQLite database.
- The full local app (`npm run dev` / `npm start`) is unchanged and still uses Hono + SQLite.

This repository is configured to deploy with GitHub Actions. For a fork, set **Settings → Pages → Build and deployment → Source: GitHub Actions** once. The site is then available at `https://<user>.github.io/<repo>/`.

To build and preview the static version locally:

```bash
npm run build:static
npm run preview -w @eisenhower/web -- --mode static
```

The preview runs at `http://localhost:4173/eisenhower-matrix/`.

## Calendar

Open the **Calendar** tab to see a Sunday-first week view (07:00–24:00). Tasks with a schedule appear as time blocks; tasks with a due date appear in the separate Due column. Overlapping items are highlighted, and the task drawer lists the conflicts.

External calendars are read-only. In the local app you can subscribe to a public ICS URL; both versions can import an exported `.ics` file.

- **iCloud**: publish the calendar (Public Calendar), copy the `webcal://` link; the app converts it to `https://`. Private iCloud calendars are not supported.
- **Google/Outlook**: use the secret/public iCal URL or published ICS link.
- The subscription URL is effectively a password. It is stored only in your local SQLite database or browser storage.

### GitHub Pages URL subscriptions

Browsers cannot fetch arbitrary calendar URLs because of CORS. The Pages build uses the small Cloudflare Worker in `workers/calendar-proxy`:

1. Change `ALLOWED_ORIGINS` in `workers/calendar-proxy/wrangler.toml` to your Pages origin.
2. Deploy it:
   ```bash
   cd workers/calendar-proxy
   npm install
   npm run deploy
   ```
3. Add a repository **Actions variable** named `CALENDAR_PROXY_URL` with the Worker URL (**Settings → Secrets and variables → Actions → Variables**), then re-run the Pages deployment. The build reads it as `VITE_CALENDAR_PROXY_URL`.

If `CALENDAR_PROXY_URL` is not set, the Pages version only offers `.ics` upload; there is no Proxy URL field in the UI.

For automatic Worker deploys, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. `.github/workflows/deploy-calendar-proxy.yml` deploys changes under `workers/calendar-proxy`.

Uploaded `.ics` files work on Pages without the proxy.

## Data

- SQLite database: `data/app.db` (created automatically on first start)
- Migrations: `apps/server/migrations/*.sql`, applied on startup
- Backups: `backups/app-<timestamp>.db`

`data/` and `backups/` are gitignored.

Copy a backup to restore:

```bash
cp backups/app-2026-01-01T00-00-00-000Z.db data/app.db
```

Stop the app before replacing the database file.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start API and Vite dev server |
| `npm run build` | Build the web app |
| `npm run build:static` | Build the browser-storage version for GitHub Pages |
| `npm start` | Serve the built app + API on port 3001 |
| `npm run open` | Start the server if needed and open the app |
| `npm run app:install` | Create the macOS launcher apps in `~/Applications` |
| `npm run app:stop` | Stop the background server |
| `npm run seed` | Insert demo tasks/tags if the active list is empty |
| `npm run backup` | Create a timestamped SQLite backup |
| `npm run typecheck` | TypeScript checks for shared, server, and web |
| `npm test` | Server API tests + matrix layout tests |

Environment variables:

- `PORT` — API/server port (default `3001`; the Vite dev proxy expects `3001`)
- `DB_PATH` — SQLite file path (default `data/app.db`)

## Layout rules

- Importance `>= threshold` → card; importance `< threshold` → dot or cluster.
- Urgency `>= threshold` → urgent side of the matrix.
- A task with both scores exactly equal to the threshold → **Pending review**.
- Cards avoid labels, clusters, dots, and other cards. If a card is displaced, a thin line connects it back to its true score.
- Search or tag filtering expands all matching unimportant tasks to compact cards so results are never hidden inside a cluster.

## Project structure

```
apps/
  server/       Hono + Drizzle + better-sqlite3
    migrations/
    src/
    test/
  web/          React + Vite + TanStack Query
    src/
packages/
  shared/       Shared types, Zod schemas, score/quadrant/due helpers, ICS parser
workers/
  calendar-proxy/  Cloudflare Worker CORS proxy for Pages URL subscriptions
mockups/
  matrix-visual.html   Static design draft (not used at runtime)
data/           SQLite database (gitignored)
backups/        SQLite backups (gitignored)
```

## API

```
GET    /api/health
GET    /api/tasks?view=active|completed|archived&q=&tagIds=
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/tags
POST   /api/tags
PATCH  /api/tags/:id
DELETE /api/tags/:id
GET    /api/calendar/subscriptions
POST   /api/calendar/subscriptions
POST   /api/calendar/import
POST   /api/calendar/subscriptions/:id/refresh
POST   /api/calendar/refresh
DELETE /api/calendar/subscriptions/:id
GET    /api/calendar/events?start=ISO&end=ISO
GET    /api/settings
PATCH  /api/settings
```

Validation lives in `packages/shared/src/index.ts` and is shared by the server and the frontend.

## Notes

- The server binds to `127.0.0.1` only. It is not exposed to the local network.
- This is a single-user app: there is no authentication or multi-user isolation.
- The matrix is intentionally an overview, not a full task table. Completed and archived items are lists.
- The static design draft in `mockups/matrix-visual.html` is useful for visual reference but is not part of the app.
