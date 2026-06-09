# 🎵 M3U Player

A small web app to manage and **play** M3U playlists. Sign in with Google,
keep your playlists in the cloud (Firestore), play them in a built-in player,
and download any playlist as an `.m3u` file. Designed for an ~8″ touch screen.

```
┌─ Google login ─────────────────────────────────────────┐
│  PLAYLISTS │            TRACKS              [Save][⬇]    │
│  (left)    │   ▶ 1. Song A                              │
│  chill     │     2. Song B                              │
│  + Create  │     + Add track                            │
├────────────┴─────────────────────────────────────────── ┤
│  ⏮   ▶ Song A   ──●──── 1:23 / 4:05   🔊    ⏭           │
└──────────────────────────────────────────────────────── ┘
```

## How it works

- **Auth:** Firebase Authentication (Google sign-in).
- **Data:** Firestore — each playlist is a document:
  `playlists/{id} = { owner, name, tracks: [{name, url}], updatedAt }`.
  No files, no Storage, no CORS, no tokens.
- **Playback:** a built-in player that handles two URL types automatically:
  - **Direct audio URLs** (`.mp3`, streams, etc.) — played via the native HTML5 `<audio>` element.
  - **SoundCloud links** (`soundcloud.com/…`) — played via the official SoundCloud Widget iframe (no API key needed, works on any public track). The widget appears inline in the player bar.
- **Download:** generates an `.m3u` file in the browser from the current tracks
  (open it in VLC/AIMP/etc. as a local file — local files expand to all tracks).

## Files

| File | Purpose |
|------|---------|
| `index.html` | 3-pane layout + player bar + sign-in |
| `css/style.css` | Styling (8″ touch layout) |
| `js/config.js` | Firebase config (public, no secrets) |
| `js/firebase.js` | Initializes Firebase once |
| `js/auth.js` | Google sign-in |
| `js/firestore.js` | Playlist CRUD in Firestore |
| `js/player.js` | Two-mode player: `<audio>` for direct URLs, SC Widget iframe for SoundCloud links |
| `js/m3u.js` | Serialize tracks to `.m3u` (for Download) |
| `js/app.js` | UI wiring |

## One-time setup (Firebase console — project `m3uplay-d9b1f`)

### 1. Enable Google sign-in
Authentication → **Sign-in method** → enable **Google**.

### 2. Authorize your domains
Authentication → **Settings** → **Authorized domains** → add the domains you
serve from (e.g. `localhost`, `127.0.0.1`, your server's domain, GitHub Pages).

### 3. Create Firestore + set Rules
Build → **Firestore Database** → **Create database** (Production mode, pick a
region). Then **Rules** tab → paste → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /playlists/{id} {
      // Read/write only your own playlists
      allow read: if request.auth != null && resource.data.owner == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.owner == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.owner == request.auth.uid;
    }
  }
}
```

> Note: these rules scope each user to their **own** playlists (by `owner` =
> their account uid). No Storage rules or CORS needed anymore.

## Run it (needs http, not file://)

- **Local:** `python -m http.server 8000` → <http://localhost:8000>
- **Deploy:** any static host (GitHub Pages, your own server). It's just static files.

## Notes

- The built-in player plays whatever the **browser** supports (mp3/m4a/ogg —
  mp3 is universal). It plays only while the tab is open.
- **SoundCloud links** work out of the box — paste any `soundcloud.com/…` URL
  as a track and the player switches to the SC Widget automatically. You can mix
  SoundCloud and direct audio links in the same playlist; auto-advance works across both.
- Cross-origin audio playback needs **no** CORS setup (only reading raw audio
  data for visualizers would — and we don't do that).
- The old Firebase **Storage** approach (files, CORS, public IAM) is gone; you
  can delete the `playlists/` folder in Storage and the public-read IAM binding
  if you want to clean up.
