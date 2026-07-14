# Snapcard — Configuration Guide

Snapcard needs no configuration to run locally or offline. The only configurable
surface is optional Google Drive backup and the deploy base path.

## Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `VITE_STANDALONE` | build | set by mode | `true` in `--mode standalone`; selects the in-browser engine. Set automatically by `vite.config.js`; don't set by hand. |
| `VITE_BASE` | build | `/` | Base path / public URL prefix. The Pages workflow sets it to `/<repo>/`. |
| `VITE_GOOGLE_CLIENT_ID` | build | empty | Google OAuth Client ID. If empty, Drive features are disabled gracefully. |
| `PORT` | server | `8787` | Port for the Express server. |
| `SNAPCARD_DB` | server | `data/snapcard.db` | SQLite file path for the server build. |
| `SNAPCARD_CHROME` | scripts | `/opt/pw-browsers/chromium` | Chromium binary for verification scripts. |

For local development, put build-time variables in a `.env` file at the repo root:

```
VITE_GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
```

`.env` is gitignored. Rebuild after changing it (the value is baked in at build time).

## Database

No setup required. On first run the server (or the in-browser engine) creates the
schema via the migrations in `shared/schema.js` and seeds three sample cards.

## Google Drive backup — one-time Google Cloud setup

1. Create a project at <https://console.cloud.google.com/>.
2. **Enable the Google Drive API** (APIs & Services → Library → Google Drive API).
3. **OAuth consent screen:** User type **External**; add your Google account under
   **Test users**; leave it in **Testing** (no verification needed for personal use).
4. **Credentials → Create OAuth Client ID → Web application.** Authorized
   JavaScript origins (origins never include a path):
   - `https://<your-username>.github.io` (the Pages origin)
   - `http://localhost:8787` (the port `start.bat` uses)
5. Provide the Client ID as `VITE_GOOGLE_CLIENT_ID`:
   - **GitHub Pages:** repo → Settings → Secrets and variables → Actions →
     **Variables** → add `VITE_GOOGLE_CLIENT_ID`; re-run the deploy workflow.
   - **Laptop:** add it to `.env`, delete `dist/`, and run `start.bat` again.

### Scope and privacy

Snapcard requests only `drive.file`: it can see **only files it creates** — a
single backup file visible to you in your Drive. With an encryption passphrase
set, the uploaded file is AES-GCM ciphertext and Google cannot read your cards.

### Notes

- A live Google sign-in cannot run in headless tests; verify it manually once
  after configuring the Client ID.
- On installed iOS web apps Snapcard uses redirect-based OAuth (popups often fail
  there). Phones should use the installed PWA at the Pages origin for Drive, not a
  laptop LAN IP, because OAuth only completes on registered origins.

## Production recommendations

- Keep the OAuth app in "Testing" with only your own accounts as test users for
  private/household use.
- Encourage Drive backup (with a passphrase) on iOS, where local storage can be
  evicted.
- Serve the standalone build over HTTPS (GitHub Pages does this) — camera access,
  service workers, and WebAuthn all require a secure context.
