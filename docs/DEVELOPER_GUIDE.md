# Snapcard — Developer Guide

## Overview

Snapcard is a React + Vite PWA that runs two ways from one codebase:

- **Server build** (`vite build` → `dist/`) talks to a Node/Express + better-sqlite3
  backend through a single RPC endpoint. Used by the Windows `start.bat` app.
- **Standalone build** (`vite build --mode standalone` → `dist-standalone/`) has no
  backend: it runs SQLite in the browser via sql.js (WebAssembly) persisted to
  IndexedDB. This is what deploys to GitHub Pages and installs as a PWA.

Both builds execute the **same** schema and business logic from `shared/`.

## Architecture

```
shared/                  One source of truth for data
  schema.js              SQL schema + SCHEMA_VERSION + migration list
  store.js               ALL business logic as functions over a db handle
  sqljs-shim.js          better-sqlite3-compatible wrapper around a sql.js db

server/                  Server build only
  db.js                  Opens better-sqlite3, runs migrate() + seed
  index.js               Express, static hosting, POST /api/rpc, LAN URLs

src/
  data/
    client.js            Build-time switch: fetch(/api/rpc) vs in-browser engine
    local-engine.js      sql.js load + IndexedDB persistence (standalone only)
  drive/
    drive.js             Google Drive backup (one impl, both builds)
    crypto.js            Optional AES-GCM/PBKDF2 backup encryption (WebCrypto)
  i18n/                  String dictionary (en, nl) + provider
  lib/                   barcode (bwip-js), scanner helpers, images, lock, backup
  components/            Barcode, Scanner, LockScreen, InstallHint
  screens/               Grid, Show, Edit, Settings
  App.jsx                Boot gate (init, lock, re-lock), routing, theme, lang

scripts/                 gen-icons + verification suite
.github/workflows/       deploy.yml (build standalone → GitHub Pages)
```

### The one-source-of-truth rule

Every query and every business rule lives in `shared/store.js` as a function that
takes a `db` handle first. The server passes a real better-sqlite3 database; the
browser passes `wrapSqlJsDb(sqlJsDatabase)`, a shim exposing the subset of the
better-sqlite3 API the store uses (`prepare().get/all/run`, `exec`, `transaction`,
`pragma`). There is never a second implementation of a query. `scripts/smoke-engines.mjs`
runs the store against **both** engines and asserts identical behaviour.

### The build-time data switch

`src/data/client.js` reads `import.meta.env.VITE_STANDALONE`, which
`vite.config.js` statically defines per mode. Because it's static, the unused
branch (and, crucially, sql.js + its wasm) is tree-shaken out of the server build.
`local-engine.js` is a dynamic `import()` so no wasm can leak into `dist/`. The
verification script asserts `dist/` contains zero `.wasm` files.

### Persistence (standalone)

Writes are debounced to IndexedDB, but `client.call()` awaits a flush before a
mutating call resolves, so a save is durable by the time the UI navigates. Writes
also flush on `visibilitychange: hidden` and `pagehide` (important on iOS).

### App lock

PIN is stored as a salted SHA-256 hash in `app_meta` (never the PIN itself).
Optional biometric unlock uses a WebAuthn platform authenticator. `App.jsx`
re-locks after the app is backgrounded longer than `RELOCK_AFTER_MS` (60s),
querying lock status on return so a mid-session PIN takes effect immediately.

### Routing

History-based (`BrowserRouter`) with `basename` from the Pages subpath. Hash
routing is deliberately avoided: on installed iOS web apps, changing the URL hash
re-triggers the camera permission prompt. `404.html` (a copy of `index.html`)
provides the SPA fallback for deep links before the service worker exists.

## Coding conventions

- ES modules everywhere; `.jsx` for React components.
- Tailwind utility classes; dark mode via the `dark` class on `<html>`.
- All user-facing strings go through `useI18n().t(key)` and must exist in **every**
  language in `src/i18n/strings.js` (the smoke test enforces key parity).
- Keep card records small; downscale/compress images on import.
- `npm run lint` must pass (ESLint flat config with React Hooks rules).

## Testing strategy

No unit-test framework; verification is behaviour-driven end-to-end via Node's
`assert` and headless Chromium (Playwright), because the risky surfaces are
browser behaviours (offline, IndexedDB, service worker, subpath, camera decode).

- `scripts/smoke-engines.mjs` — store logic on both engines + i18n key parity.
- `scripts/verify-server.mjs` — server build: RPC, real-browser UI, export/import,
  the "server unreachable" screen + retry.
- `scripts/verify-standalone.mjs` — standalone under a simulated Pages subpath:
  zero external requests, IndexedDB persistence, 404 + SW deep links, full
  offline, image-decode scan, settings flows, sort persistence, auto re-lock,
  iOS install hint.
- `scripts/verify-drive.mjs` — Drive with stubbed token client + endpoints:
  upload/download round-trip incl. the encrypted path.

Run all with `npm run verify`. Chromium path defaults to `/opt/pw-browsers/chromium`;
override with `SNAPCARD_CHROME`.

## CI/CD

`.github/workflows/deploy.yml` builds the standalone target with `VITE_BASE`
derived from the repo name and deploys to GitHub Pages on push to the deploy
branches. The `github-pages` environment only accepts deploys from the repo's
default branch — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#pages-deploy).

## Adding a feature

- **New data field/table:** append a migration object to `MIGRATIONS` in
  `shared/schema.js` (never edit an existing one), update the relevant functions
  in `shared/store.js`, and extend `smoke-engines.mjs`.
- **New screen:** add under `src/screens/`, wire a `<Route>` in `App.jsx`, add
  strings to every language, and give elements `data-testid`s for verification.
- **New language:** add a top-level key to `STRINGS` with the full key set (the
  smoke test fails otherwise) and to `LANGUAGES`.

## Debugging

- Standalone data lives in IndexedDB database `snapcard`, store `sqlite`, key
  `main` (a serialized SQLite file). Clear it to reset local state.
- `window.__snapcardCall(method, ...args)` is exposed by the local engine for
  poking the store from DevTools / verification scripts.
- Server data is `data/snapcard.db` (SQLite, WAL mode).
