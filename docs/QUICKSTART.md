# Snapcard — Quick Start

Get productive in under ten minutes. Pick the path that matches you.

## I just want the app on my phone (recommended)

1. Open the published web app in your phone's browser:
   `https://<your-username>.github.io/<repo>/`
   (For this repository: <https://shenthils-ui.github.io/Snapcard/>.)
2. Install it to your home screen:
   - **Android (Chrome):** menu ⋮ → **Add to Home screen** → Install.
   - **iPhone (Safari):** you must be in the real **Safari** app, not an in-app
     browser. Tap the **Share** button (square with an up arrow) → scroll down →
     **Add to Home Screen**. Snapcard shows a one-time hint banner to guide you.
3. Open Snapcard from your home screen. It works fully offline from now on.
4. You'll see three sample cards. Tap one to see its barcode, or tap **＋** to add
   your own — either scan the card's barcode or type the number in.

That's it. Everything is stored on your device; nothing is uploaded unless you
turn on Google Drive backup in Settings.

> On iPhone, also turn on Google Drive backup (Settings → Google Drive) — iOS can
> clear a web app's storage after long inactivity, and Drive is the durable copy.

## I want to run it on my Windows laptop

1. Install [Node.js LTS](https://nodejs.org/).
2. Double-click **`start.bat`**. The first run installs and builds automatically,
   then opens `http://localhost:8787` and prints a Wi-Fi URL for phones.
3. Add cards the same way as above.

## I'm a developer

```bash
npm install
npm run dev            # server-build frontend (run `npm start` in another shell for the API)
npm start              # Express + SQLite backend on :8787
npm run lint           # ESLint
npm run verify         # full end-to-end suite (headless Chromium)
```

See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for architecture and workflow.

## First successful task: add your first real card

1. Tap **＋** (bottom-right).
2. Tap **📷 Scan** and point the camera at a loyalty card's barcode — or type the
   number into **Code value** and pick the matching **Code format**.
3. Enter the **Store name**, pick a tile **colour**, optionally add a label, note,
   tags, balance, expiry, or photos.
4. Tap **Save**. The card opens with its barcode rendered large — hold it to the
   scanner at the till. The screen stays awake while a code is shown.
