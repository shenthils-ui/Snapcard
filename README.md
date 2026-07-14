# Snapcard

A local-first, privacy-first loyalty card wallet (a Stocard replacement) for personal / household use. One codebase, two ways to run it:

1. **On a Windows laptop** — a small local server + SQLite database, started by double-clicking `start.bat`. Phones on the same Wi-Fi can open it too.
2. **As a standalone installable app (PWA)** on an Android or iOS phone — no laptop, no server, no account. All data lives in the phone's own browser storage (SQLite compiled to WebAssembly, persisted to IndexedDB).

Both versions use the **identical data format**: a backup exported from either imports cleanly into the other.

**Privacy:** the core app makes **zero external network calls** at runtime. The only permitted external calls are optional Google Drive backup, and only after you sign in and enable it. Scanning, rendering, and storage all work fully offline.

## Documentation

| Guide | For |
|---|---|
| [Quick Start](docs/QUICKSTART.md) | Get productive in under ten minutes |
| [User Guide](docs/USER_GUIDE.md) | Every screen, workflow, and FAQ for end users |
| [Configuration](docs/CONFIGURATION.md) | Environment variables and Google Drive setup |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Architecture, conventions, testing, extending |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Install, camera, storage, Drive, and deploy issues |
| [Changelog](CHANGELOG.md) | What changed and when |

The sections below are a condensed version of those guides.

---

## Running on the laptop (Windows)

1. Install Node.js (LTS) from <https://nodejs.org/> — just click through the installer.
2. Double-click **`start.bat`**.
   - On the first run it installs dependencies and builds the app (one-time, needs internet).
   - Then it starts the server and opens your browser at `http://localhost:8787`.
   - It also prints a LAN URL like `http://192.168.1.23:8787` — open that on a phone connected to the same Wi-Fi.
3. Your data is stored in `data/snapcard.db` next to the app.

> Phones on the LAN can *use* the laptop app, but for Google Drive sign-in they should use the installed PWA instead (see below) — Google OAuth only completes on registered origins, and a LAN IP is not one. Because laptop and phone sync the same backup file under one Google account, Drive doubles as the transfer channel between them.

## Installing the phone app (PWA from GitHub Pages)

One-time repo setting: **Settings → Pages → Source → "GitHub Actions"**. After that, every push to `main` deploys automatically via the included workflow, to `https://USERNAME.github.io/REPO/`.

- **Android (Chrome):** open the Pages URL → menu (⋮) → **Add to Home screen** → Install.
- **iOS (Safari):** open the Pages URL → **Share** → **Add to Home Screen** (works in the EU).

Once installed, the app works fully offline — no laptop or server needed, ever.

## Moving data between devices

- **Export / import:** Settings → Backup → *Export backup (JSON)* downloads a file; *Import backup (JSON)* replaces all cards with the file's contents (inside a transaction). The format is identical on both builds.
- **Google Drive:** sign in on both devices with the same Google account; *Back up now* on one, *Restore from Drive* on the other. This is backup/restore (last-write-wins), not merge sync — the app warns you when the copy you're about to overwrite looks newer.

## Google Drive setup (optional, one-time)

Drive backup is off and invisible-but-disabled until you configure a Google OAuth Client ID:

1. Create a project at <https://console.cloud.google.com/>.
2. **Enable the Google Drive API** (APIs & Services → Library → Google Drive API → Enable).
3. **Configure the OAuth consent screen:** User type **External**; add your own Google account under **Test users**; leave the app in **Testing** (no verification needed for personal use).
4. **Create credentials → OAuth Client ID → Web application**, with **Authorized JavaScript origins**:
   - `https://USERNAME.github.io` (origins never include a path — this is correct even though the app lives under `/REPO/`)
   - `http://localhost:8787` (the port `start.bat` uses)
5. Put the Client ID in the build:
   - GitHub Pages: repo → Settings → Secrets and variables → Actions → **Variables** → add `VITE_GOOGLE_CLIENT_ID`; re-run the deploy.
   - Laptop: create a `.env` file containing `VITE_GOOGLE_CLIENT_ID=your-id-here`, delete the `dist` folder, and run `start.bat` again (it rebuilds).

The app requests only the `drive.file` scope: it can see **only files it created** — one backup file (`snapcard-backup.json`, or `snapcard-backup.enc` when encrypted), visible in your Drive. With an encryption passphrase set, Google cannot read your card data; without the passphrase the backup cannot be decrypted, so don't lose it. The Google sign-in script is loaded only when you press sign in — signed out, the app makes zero external requests.

## iOS notes (please read)

- **Storage durability:** iOS deletes script-written storage (IndexedDB) if the site has no user interaction for **7 days**, and may clear it when the device is low on space. The app requests durable storage on startup and shows the result in Settings, but there is no hard guarantee — **enable Google Drive backup on iOS**; it is the durable copy. Card photos are automatically downscaled/compressed (≤1024 px, ≤300 KB) to keep the database small.
- **Camera:** iOS does not persist camera permission for web apps and may prompt again on each scanner session. The scanner opens as an overlay (no URL change — hash/URL changes re-trigger the permission prompt in installed apps) and requests the stream once per session. If the installed app's camera misbehaves, run Snapcard in a normal Safari tab instead — and manual entry is always available.
- **Google sign-in:** inside an installed (home-screen) app, Snapcard uses a **redirect-based** OAuth flow instead of a popup, which is the variant that works there.
- **Screen brightness:** while a card is shown, the app holds a **Screen Wake Lock** so the display doesn't sleep at the till. Boosting brightness to maximum is a native-app-only capability; Wake Lock is the closest a browser PWA gets.

## Development

```bash
npm install
npm run dev               # Vite dev server (server-build mode, needs `npm start` for the API)
npm start                 # Express + better-sqlite3 backend on :8787
npm run build             # server-target frontend -> dist/
npm run build:standalone  # standalone target (sql.js in the browser) -> dist-standalone/
npm run lint              # ESLint (flat config + React Hooks rules)
npm run smoke             # shared logic against BOTH engines + i18n key parity (Node, fast)
npm run verify            # full end-to-end verification (see below)
```

Architecture in one paragraph: `shared/` holds the SQL schema (with `schema_version` + migrations) and **all** business logic as functions over a db handle. The server passes a real better-sqlite3 database; the browser passes a sql.js database wrapped in a thin better-sqlite3-compatible shim (`shared/sqljs-shim.js`) — one implementation, never two. `src/data/client.js` decides **at build time** (`import.meta.env.VITE_STANDALONE`, statically defined in `vite.config.js`) whether calls go to `fetch('/api/rpc')` or the in-browser engine; the dead branch is tree-shaken, so no wasm exists in the server build. Routing is history-based (not hash-based — hash changes re-trigger the iOS camera prompt) with the router basename following the GitHub Pages subpath, and `404.html` covers deep links before the service worker takes over.

### Verification

Re-run after every change:

```bash
node scripts/smoke-engines.mjs      # shared store on better-sqlite3 AND the sql.js shim
node scripts/verify-server.mjs      # server build: RPC API, real-browser UI, export/import round-trip
node scripts/verify-standalone.mjs  # standalone build under a simulated GitHub Pages subpath:
                                    #   zero external requests, IndexedDB persistence, 404.html deep
                                    #   links, service worker + full offline, every screen, and a card
                                    #   added by decoding a barcode image through the scanner path
node scripts/verify-drive.mjs       # Drive with stubbed token client + endpoints: upload/download
                                    #   round-trip reproduces the data exactly, including encrypted
```

Notes:

- Scripts use the system Chromium at `/opt/pw-browsers/chromium` by default; point `SNAPCARD_CHROME` at your Chrome/Chromium binary elsewhere.
- Decoding a code from a still image is supported but can be less reliable than a live camera scan — good lighting and a sharp photo help.
- A **real Google OAuth cannot run in headless tests**, so the Drive tests stub the token client and endpoints. A live Drive sign-in must be tested manually once after you configure your Client ID.
- **Manual iOS checks (to do once on a real iPhone, results to be recorded here):** ☐ installed app scans with the camera · ☐ home-screen storage survives closing and reopening the app · ☐ redirect-based Drive sign-in completes when launched from the home screen.

## What's inside

| Piece | Where |
|---|---|
| SQL schema + migrations | `shared/schema.js` |
| All business logic (both builds) | `shared/store.js` |
| better-sqlite3-compatible sql.js shim | `shared/sqljs-shim.js` |
| Express server + RPC endpoint | `server/` |
| Build-time data-layer switch | `src/data/client.js` |
| In-browser engine (IndexedDB persistence) | `src/data/local-engine.js` |
| Screens (grid, show, add/edit, settings) | `src/screens/` |
| Camera scanner + image decode (zxing) | `src/components/Scanner.jsx` |
| Code rendering, all 12 formats (bwip-js) | `src/lib/barcode.js` |
| Google Drive module + WebCrypto encryption | `src/drive/` |
| UI strings (English + Dutch) | `src/i18n/strings.js` |
| Pages deploy workflow | `.github/workflows/deploy.yml` |
| Verification scripts | `scripts/` |

Supported code formats (scan + render): EAN-13, EAN-8, UPC-A, UPC-E, CODE128, CODE39, ITF, CODABAR, QR, Data Matrix, PDF417, Aztec.
