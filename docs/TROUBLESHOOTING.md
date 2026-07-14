# Snapcard — Troubleshooting

## Install & usage

### "Add to Home Screen" is missing on iPhone
The most common cause is that the page is open in an **in-app browser** (opened
from a link inside Gmail, WhatsApp, Slack, etc.), which cannot install web apps.
- Copy the URL and open it in the real **Safari** app (blue compass icon).
- Tap **Share** (square with an up arrow, centre of the bottom toolbar) → scroll
  the list of actions **down** → **Add to Home Screen**.
- If it's genuinely absent: Share → **Edit Actions…** → enable "Add to Home Screen".
- If still absent, check Settings → Screen Time → Content & Privacy Restrictions,
  or whether a work/school profile manages the device.

On Android use **Chrome** → ⋮ → Add to Home screen. Safari doesn't exist on Android.

### The page shows GitHub's "There isn't a GitHub Pages site here" 404
- The deploy may not have finished, or Pages isn't enabled. See [Pages deploy](#pages-deploy).
- If it worked before, it's a cached 404: hard-refresh (or open a private tab).

### Camera won't scan (iPhone)
iOS doesn't persist camera permission for web apps and may re-prompt. Allow it
when asked. If the installed app's camera misbehaves, open Snapcard in a normal
Safari tab, or use **Decode from photo** / manual entry. The manual fallback is
always available.

### My cards disappeared (iPhone)
iOS can clear a web app's local storage after ~7 days of no interaction, or when
storage is low. Restore from a JSON export or Google Drive. Prevent it by enabling
Google Drive backup and opening the app periodically.

### Google sign-in fails
- Drive features are hidden if `VITE_GOOGLE_CLIENT_ID` isn't set at build time.
- Sign-in only completes on **registered origins** (the Pages URL and
  `http://localhost:PORT`), not arbitrary LAN IPs. On phones, use the installed
  PWA at the Pages origin.
- Tokens are short-lived; if a backup/restore says the session expired, sign in
  again.

### "This backup is encrypted / wrong passphrase"
The Drive file was encrypted with a passphrase. Enter the same passphrase in
Settings → Google Drive before restoring. Without it the file cannot be decrypted.

## Server build (Windows)

### "Cannot reach the Snapcard server"
The Express server isn't running. Start it with `start.bat` and press **Retry**.

### start.bat says Node isn't installed
Install [Node.js LTS](https://nodejs.org/) and run `start.bat` again.

### Phones on Wi-Fi can't open the LAN URL
Ensure the phone is on the same network and the laptop firewall allows the port
(default 8787). Note Google Drive sign-in won't work over a LAN IP — use the
installed PWA for Drive.

## Development

### `npm run verify` can't find Chromium
Set `SNAPCARD_CHROME` to your Chrome/Chromium binary path.

### Build fails with "Module not found"
Ensure all source is committed and dependencies installed (`npm ci`). A past
regression was `.gitignore` matching `src/data/` — the pattern is now anchored
(`/data/`).

### Lint errors about setState in an effect
The React Hooks rule flags synchronous `setState` in effect bodies. Prefer lazy
`useState(initializerFn)` for values computed from browser APIs, or move the
`setState` after an `await`. See `src/App.jsx` for the sanctioned data-load-on-
mount pattern.

<a id="pages-deploy"></a>
## GitHub Pages deploy

### Deploy job fails: "Resource not accessible by integration" (Create Pages site)
Pages isn't enabled. Repo → Settings → Pages → Source → **GitHub Actions**, then
re-run the workflow.

### Deploy job fails: "Branch is not allowed to deploy to github-pages"
The `github-pages` environment only accepts deploys from the repo's **default
branch**. Either make `main` the default (Settings → General → Default branch) or
add the deploying branch to the environment's allowed branches. The workflow's
`on.push.branches` already lists both the deploy branch and the current default.

### Build succeeds but the site 404s on deep links
Confirm `404.html` is present in the artifact (the build copies `index.html` to
it) and that `VITE_BASE` matches the `/<repo>/` subpath.
