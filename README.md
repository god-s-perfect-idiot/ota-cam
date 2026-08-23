# ota-cam

A **digital disposable camera** for parties and events.

Guests open a link on their phone, shoot photos with no preview, and every shot goes straight into **your Google Drive**. Nobody needs a Google account — only you (the host) connect Drive once.

```
Guest phone                    Your server                     Google Drive
───────────                    ───────────                     ────────────
  📷  tap shutter    ──POST──▶  validate image     ──upload──▶  /Disposable Camera/
  (no preview)                 rate-limit                      /Rooftop party/
                               encrypt at rest                   0001_2026-08-23_Samar.jpg
                               retry queue
```

## Features

- **Disposable feel** — no photo previews after the shutter; just a shot counter
- **Film look** — warm tones, grain, vignette, and an orange date stamp burned into every JPEG
- **Offline-safe** — shots queue in IndexedDB and retry automatically when the connection returns
- **Party-ready** — share a link or QR code; guests type an optional name once
- **Host dashboard** — connect Drive, create rolls, copy links, wind up a roll when the party ends
- **PWA** — add to home screen on iOS/Android for a full-screen camera experience

## Quick start

### 1. Install

```bash
npm install
cp .env.example .env
```

Generate secrets and paste them into `.env`:

```bash
openssl rand -hex 32   # → ENCRYPTION_KEY
openssl rand -hex 32   # → SESSION_SECRET
```

Pick an `ADMIN_PASSWORD` (at least 8 characters). This is what you type at `/admin`.

### 2. Google Cloud setup (one-time, ~10 minutes)

You need a **Web application OAuth client** so the server can upload to your Drive on behalf of guests.

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or pick an existing one)
3. **Enable the Google Drive API**
   - APIs & Services → Library → search "Google Drive API" → Enable
4. **Configure the OAuth consent screen**
   - APIs & Services → OAuth consent screen
   - User type: **External** (unless this is a Workspace org-only app)
   - App name: `ota-cam`
   - Add your email as a test user while the app is in "Testing" mode
5. **Create credentials**
   - APIs & Services → Credentials → Create credentials → **OAuth client ID**
   - Application type: **Web application**
   - Authorised redirect URIs — add **both** of these while developing:
     - `http://localhost:8787/api/auth/google/callback`
     - (later) `https://your-domain.com/api/auth/google/callback`
   - Copy the **Client ID** and **Client secret** into `.env`

The server requests only the `drive.file` scope — access to files **this app created**, not your entire Drive.

### 3. Run

**Development** (hot reload, Vite on `:5173` proxying API to `:8787`):

```bash
npm run dev
```

Open **http://localhost:5173/admin** on your laptop.

**Production** (single server serves the built UI + API):

```bash
npm run build
npm start
```

Open **http://localhost:8787/admin**.

### 4. Host workflow

1. Sign in at `/admin` with your `ADMIN_PASSWORD`
2. Click **Connect Drive** and approve Google access
3. **Create camera** — give the roll a name (e.g. "Rooftop party")
4. **Copy link** or **Show QR** and share with guests
5. After the event, **Open in Drive** to see every photo, or **Wind up roll** to stop new shots

Guest URL shape: `https://your-domain.com/c/ABCDEFGHJK`

## Using a real phone on your LAN

Phone cameras require a **secure context** (HTTPS or localhost). Over plain HTTP on a LAN IP, the browser will block `getUserMedia`.

Options:

| Approach | When to use |
|----------|-------------|
| **Cloudflare Tunnel** / **ngrok** | Easiest for a one-off party — gives you HTTPS instantly |
| **mkcert + reverse proxy** | Self-hosted HTTPS on your LAN |
| **Deploy to a VPS** | Best for a recurring event URL |

Set `PUBLIC_BASE_URL` in `.env` to your public HTTPS URL **before** connecting Google Drive, because the OAuth redirect URI must match exactly.

For local dev with a phone, run Vite with `--host` (already configured) and tunnel port `5173`:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Update `PUBLIC_BASE_URL` and add the tunnel callback URL to Google Cloud credentials.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Server port (default `8787`) |
| `PUBLIC_BASE_URL` | yes | Public URL, no trailing slash. Used for share links and OAuth redirect. |
| `GOOGLE_CLIENT_ID` | for uploads | OAuth client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | for uploads | OAuth client secret |
| `ADMIN_PASSWORD` | yes | Password for `/admin` |
| `ENCRYPTION_KEY` | yes | 64 hex chars (`openssl rand -hex 32`). Encrypts the stored refresh token. |
| `SESSION_SECRET` | yes | Signs admin session cookies |
| `MAX_UPLOAD_BYTES` | no | Max photo size (default 15 MB) |
| `DEFAULT_ROLL_PHOTO_CAP` | no | Safety cap per roll (default 500) |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | no | Per-IP upload rate limit (default 30) |
| `DATA_DIR` | no | Where `db.json` and the photo log live (default `./data`) |

## Security model

- **Guests never sign in.** Upload is gated by an unguessable roll code in the URL (~49 bits of entropy).
- **The host's refresh token** is encrypted at rest (AES-256-GCM) and never sent to the browser.
- **Uploads are sniffed by magic bytes**, not the client-declared `Content-Type`.
- **Rate limiting** on uploads and admin login.
- **Per-roll photo caps** so a leaked link cannot fill your Drive.
- **Idempotent uploads** — retries of a successful shot do not duplicate the photo in Drive.

For a public deployment, put the app behind HTTPS, use a strong `ADMIN_PASSWORD`, and keep `PUBLIC_BASE_URL` in sync with your OAuth redirect URI.

## Project structure

```
ota-cam/
├── server/          Fastify API — OAuth, Drive uploads, roll management
│   └── src/
│       ├── routes/  admin, camera (public upload), google OAuth
│       └── lib/     crypto, drive client, image sniffing, JSON store
├── web/             Vite + React PWA — camera UI + host dashboard
│   └── src/
│       ├── pages/   CameraPage, AdminPage, HomePage
│       └── lib/     capture (film look), upload queue (IndexedDB), camera hook
├── data/            Created at runtime — db.json + photos.jsonl (gitignored)
└── .env             Your secrets (gitignored)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server + Vite (parallel) |
| `npm run build` | Production build (web → `web/dist`, server → `server/dist`) |
| `npm start` | Run production server (serves `web/dist` + API) |
| `npm test` | Run all tests (43 total) |
| `npm run typecheck` | TypeScript check both workspaces |

## How it feels to use

1. Guest scans QR → enters optional name → sees a viewfinder
2. Tap the big orange shutter → brief flash animation → counter ticks up
3. **No preview.** The photo is already queuing for upload.
4. Host opens the Drive folder later and finds chronologically sorted JPEGs with date stamps

## Troubleshooting

**"Camera needs a secure connection"** — you're on `http://192.168.x.x`. Use HTTPS via a tunnel or deploy.

**"Google credentials missing"** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env` and restart.

**"The camera owner needs to reconnect Google Drive"** — host revoked access or the refresh token expired. Sign in at `/admin` → Connect Drive again.

**Photos stuck on "saving"** — venue Wi-Fi is flaky. They'll retry automatically; tap the red badge to force a retry.

**Google OAuth redirect mismatch** — `PUBLIC_BASE_URL` must exactly match a redirect URI registered in Google Cloud (scheme, host, port, path).

## Licence

MIT
