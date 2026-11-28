# 🎵 M3U Player

A small web app to manage and **play** M3U playlists. Sign in with Google,
keep your playlists in the cloud (Firestore), play them in a built-in player,
and download any playlist as an `.m3u` file. Designed for an ~8″ touch screen.

```
┌─ Google login ─────────────────────────────────────────┐
│ PLAYLISTS +│ Selected playlist   [Play all][Add][⬇]     │
│ chill     │ Thumbnail gallery or editable track rows  │
│ favourites│ YouTube selection opens the player popup │
│           │                                          │
├────────────┴─────────────────────────────────────────── ┤
│  ⏮   ▶ Song A   ──●──── 1:23 / 4:05   🔊    ⏭           │
└──────────────────────────────────────────────────────── ┘
```

## How it works

- **Auth:** Firebase Authentication (Google sign-in).
- **Data:** Firestore — each playlist is a document:
  `playlists/{id} = { owner, name, tracks: [{name, url, thumb?, channelTitle?}], updatedAt }`.
  Imported YouTube lists also retain optional source metadata. M3U import and
  download happen in the browser; Firebase Storage is not used.
- **Playback:** a built-in player that handles three URL types automatically:
  - **Direct audio URLs** (`.mp3`, streams, etc.) — played via the native HTML5 `<audio>` element.
  - **SoundCloud links** (`soundcloud.com/…`) — played via the official SoundCloud Widget iframe (no API key needed, works on any public track). The widget appears inline in the player bar.
  - **YouTube links** — played in the shared video popup through the YouTube
    IFrame API. Importing a playlist uses the same browser API key as channel lookup.
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
| `js/player.js` | Queue coordinator for direct audio, SoundCloud and YouTube |
| `js/yt-playlists/` | YouTube playlist import dialog and [feature guide](js/yt-playlists/README.md) |
| `js/yt-channels/` | Personal channels, shared YouTube metadata access and video popup |
| `css/apple.css` | Current appearance, library menu, artwork rows and thumbnail grid |
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
- **Deploy:** GitHub Pages using [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
  Add repository secret `YT_BROWSER_API_KEY`, select **Settings → Pages → Source:
  GitHub Actions**, then run **Deploy M3U Player** from Actions. The workflow
  generates the browser config in the deployment artifact; keep the tracked
  config key empty. See the [channel setup guide](js/yt-channels/README.md).

## Notes

- **YouTube playlists:** use **Playlists → + → Add YouTube playlist**, paste a
  public playlist link, preview its videos, optionally rename it, and import.
  Imports create editable copies in your account; later changes on YouTube do
  not update them. Up to 500 playlist entries are supported, with unavailable
  entries skipped and reported before import. Mixes, Watch later and history
  are not supported. The existing `YT_BROWSER_API_KEY` setup is shared with
  channel lookup; no additional user account permissions are requested.
- Imported YouTube playlists use a responsive thumbnail grid. Manual and M3U
  playlists retain editable rows with YouTube thumbnails, supplied artwork, or
  a music placeholder. Adding, reordering and removing tracks preserves the
  imported artwork and creator names.
- Selecting any YouTube track opens the shared YouTube player dialog, including
  tracks added manually. Playlist playback advances automatically and retains
  the existing repeat behaviour. Mixed queues switch to the bottom audio or
  SoundCloud player for those items, then reopen the dialog for YouTube videos.
  Closing the dialog stops playback; switching playlists also stops playback.
- Verification: `node --test js/yt-channels/tests/*.test.mjs`; for the browser
  integration suite, set `CHROME_PATH` to a Chromium executable and run
  `node js/yt-channels/tests/browser.mjs`. Fixtures exercise imports, pagination,
  save failures, thumbnails, dialog playback, mixed queues and account isolation.

See the [playlist feature guide](js/yt-playlists/README.md) for import formats,
limits, storage, playback details and screenshot options. Developer references
are [ARCHITECTURE.md](documents/ARCHITECTURE.md),
[APPLE_UI.md](documents/APPLE_UI.md) and [CLAUDE.md](CLAUDE.md).

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
