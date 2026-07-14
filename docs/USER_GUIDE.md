# Snapcard — User Guide

> Screenshots: add images under `docs/img/` and reference them where the
> `_[screenshot: …]_` placeholders appear.

## What Snapcard is

Snapcard is a private, offline loyalty-card wallet — a replacement for apps like
Stocard. It keeps all your store cards in one place so you can show their
barcodes at the till without carrying the plastic. It is built for personal and
household use: no account, no ads, no analytics, and no data leaves your device
unless you explicitly turn on Google Drive backup.

**Who it's for:** individuals and families who want their loyalty cards handy on
their phone and, optionally, mirrored to their own Google Drive.

## Core concepts

- **Card** — one loyalty card: a store name, the barcode/QR value and its format,
  and optional extras (label, colour, note, tags, balance, expiry, photos).
- **Favourite** — a card pinned to a row at the top of the grid for quick access.
- **Tag** — a free-form label (e.g. "groceries") for grouping and searching.
- **Backup** — a JSON snapshot of all cards, used to move data between devices or
  to Google Drive. The format is identical on every platform.

## The screens

### Card grid (home)
_[screenshot: grid]_

The home screen shows all your cards as coloured tiles. Favourites appear in
their own row on top. Use the **search box** to filter by store name, label,
note, or tag, and the **sort control** (recently used / name / store) to reorder.
Your sort choice is remembered between launches. Tap **＋** to add a card, or the
**⚙️** gear to open Settings.

### Card detail
_[screenshot: show card]_

Tapping a tile opens the card with its barcode or QR code rendered large and
centred for scanning. It also shows the store, label, balance, expiry, note,
tags, and any photos. Buttons: **Edit**, **Copy code** (copies the raw value),
and **Delete**. While this screen is open the display is kept awake so it won't
dim mid-scan. (Forcing maximum brightness isn't possible for a web app; keeping
the screen awake is the closest available.)

### Add / edit card
_[screenshot: edit]_

- **📷 Scan** opens the camera scanner; a successful read fills the code value and
  format automatically.
- **🖼️ Decode from photo** reads a barcode from a picture you choose (handy if the
  live camera struggles; it can be less reliable than a live scan).
- Fill in the store name (required), and optionally a label, colour, note, tags,
  balance and balance type, expiry date, and front/back photos. Photos are
  automatically shrunk and compressed to keep storage small.
- **Save** stores the card; **Cancel** discards changes.

### Scanner
_[screenshot: scanner]_

A full-screen camera view that decodes all supported formats. If camera access is
denied or unavailable, you get a clear message and can enter the code by hand.
The camera is requested once per scanning session.

### Settings
_[screenshot: settings]_

- **Theme** — Light, Dark, or System.
- **Language** — English or Dutch (more can be added in code).
- **App lock** — set a PIN (4+ digits). With a PIN set, Snapcard asks for it on
  launch and again if the app has been in the background for over a minute.
  Optionally enable **biometric unlock** (Face ID / fingerprint via your device).
- **Backup** — **Export** downloads a JSON file; **Import** replaces all cards
  with a file's contents. Use this to move data between devices.
- **Storage** (installed app only) — shows whether the browser granted durable
  storage, with guidance if not.
- **Google Drive backup** — optional cloud backup to your own Drive; see below.
- **About** — a short description and which build you're running.

## Common tasks

**Add a card by scanning:** ＋ → 📷 Scan → point at the barcode → fill in the
store name → Save.

**Add a card manually:** ＋ → type the number into Code value → choose the format
→ store name → Save.

**Show a card at the till:** tap its tile; hold the rendered code to the scanner.

**Mark a favourite:** open the card → Edit → tick ⭐ Favourite → Save.

**Search:** type in the grid search box; it matches store, label, note, and tags.

**Move data to a new phone:** Settings → Export backup on the old device, transfer
the file, Settings → Import backup on the new device. Or use Google Drive on both.

## Google Drive backup (optional)

Drive backup is off until an administrator configures a Google Client ID (see the
[Configuration Guide](./CONFIGURATION.md)). Once available:

1. Settings → Google Drive → **Sign in to Google**.
2. **Back up now** uploads a single file (`snapcard-backup.json`) to your Drive.
   The app can only see files it created.
3. On another device signed into the same Google account, **Restore from Drive**
   pulls that file in (replacing local cards). Snapcard warns you when the copy
   you're about to overwrite looks newer than the other.
4. **Auto-backup** uploads automatically a few seconds after changes.
5. **Encrypt backup** with a passphrase keeps Google from reading your cards.
   Remember the passphrase — without it the backup can't be restored.

## Best practices

- On iPhone, enable Google Drive backup — iOS may clear a web app's local storage
  after ~7 days of no use.
- Export a JSON backup occasionally as an extra safety net.
- If you set an encryption passphrase, store it somewhere safe.

## Frequently asked questions

**Does my data go to the cloud?** No — never, unless you sign in and enable Google
Drive backup.

**Can I use it without internet?** Yes. After first load the installed app works
fully offline.

**Why won't "Add to Home Screen" appear on my iPhone?** You're likely in an in-app
browser (opened from another app). Open the link in the real **Safari** app, then
use Share → Add to Home Screen. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

**Can I boost screen brightness for scanning?** Not from a web app; Snapcard keeps
the screen awake instead, which is the closest possible.

## Known limitations

- Decoding from a still image is less reliable than a live camera scan.
- Google sign-in requires a configured Client ID and works on registered origins
  (the Pages URL and `http://localhost:PORT`), not arbitrary LAN IPs.
- iOS does not persist camera permission for web apps and may re-prompt.
- iOS may evict local storage after prolonged inactivity — use Drive backup.
