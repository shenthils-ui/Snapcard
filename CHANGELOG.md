# Changelog

All notable changes to Snapcard are documented here. This project uses a simple
date-stamped format; there is no published package.

## [Unreleased]

### Added
- **Auto re-lock.** With a PIN set, Snapcard re-requires it after the app has been
  in the background for over 60 seconds (lock status is checked on return, so a
  PIN enabled mid-session applies immediately).
- **iOS install hint.** A one-time, dismissible banner guides iOS Safari users to
  "Add to Home Screen" (the platform with no `beforeinstallprompt`). Shown only on
  the installable standalone build, on iOS/iPadOS, when not already installed.
- **Persisted grid sort.** The grid remembers your sort choice across launches.
- **ESLint** flat config with the React Hooks rules; `npm run lint`.
- **Documentation set** under `docs/`: Quick Start, User Guide, Configuration,
  Developer Guide, Troubleshooting; plus this changelog.
- **Verification coverage** for sort persistence, auto re-lock (brief vs. long
  background), and the iOS install hint.

### Changed
- App boot split into an async worker + retry wrapper so the mount effect never
  calls `setState` synchronously.
- `<html lang>` now tracks the selected language for assistive technology.
- README restructured with a documentation index.

### Fixed
- (Earlier in development) `.gitignore` `data/` pattern also matched `src/data/`,
  leaving the frontend data layer uncommitted and breaking the Pages build; the
  pattern is now anchored to the repo root.
- (Earlier) Stack overflow when encrypting photo-sized Drive backups; base64 is
  now chunked.
- (Earlier) Save-then-reload could lose a write in the standalone engine; mutating
  calls now flush to IndexedDB before resolving.
- (Earlier) Deep-link icon 404s from page-relative icon URLs; now root-relative.

## [0.1.0] — initial build

### Added
- Local-first loyalty-card wallet from one codebase in two forms: a Windows
  server build (Express + better-sqlite3) and an installable standalone PWA
  (sql.js in the browser, IndexedDB), sharing one schema and business logic.
- Screens: card grid (favourites, search, sort), card detail with wake lock and
  on-device barcode rendering (12 formats via bwip-js), add/edit with camera
  scanner (zxing) and still-image decode, settings.
- App lock (PIN + optional WebAuthn biometric), theme, English/Dutch i18n.
- JSON export/import (replace-all, transactional) identical on both builds.
- Optional Google Drive backup: opt-in, lazy sign-in (popup + iOS redirect),
  single backup file, optional AES-GCM passphrase encryption, auto-backup.
- PWA (offline precache incl. wasm, 404.html SPA fallback), GitHub Pages deploy
  workflow, `start.bat`, seed data, README.
- Verification suite: engine smoke test + Playwright end-to-end for server build,
  standalone build under a simulated Pages subpath, and a stubbed Drive round-trip.
