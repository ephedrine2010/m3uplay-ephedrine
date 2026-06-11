# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

Must be served over **http(s), not `file://`** — ES modules and the Google sign-in popup require it.

```
python -m http.server 8000
# → http://localhost:8000
```

Also works via VS Code Live Server. There is **no build step, no package.json, no test suite**.

Live deployment: `https://ephedrine2010.github.io/m3uplay-ephedrine/` (GitHub Pages, branch `main`).

## Architecture

Vanilla HTML/CSS/JS — no framework, no bundler. Modules are native ES modules (`<script type="module">`). Firebase SDK is loaded directly from `https://www.gstatic.com/firebasejs/10.12.2/...` — **no npm install**.

**`app.js` is the only stateful controller.** It holds `state = { uid, playlists[], current, tracks[] }` and wires every DOM event to the other modules. The other JS files are pure-function modules with no global state of their own.

Module responsibilities:
- **`firebase.js`** — initializes Firebase once, exports `app`. Shared by auth and firestore.
- **`auth.js`** — `watchAuth(cb)`, `signIn()`, `signOutUser()`. Google popup sign-in only.
- **`firestore.js`** — playlist CRUD. `listPlaylists` queries `where("owner","==",uid)` and sorts client-side (avoids a composite index).
- **`player.js`** — three-mode player. Direct audio URLs use the native `<audio>` element; `soundcloud.com` URLs use an `<iframe>` with the SC Widget API; `youtube.com`/`youtu.be` URLs use the YouTube IFrame API player. A single `mode` (`"audio"|"sc"|"yt"`) tracks which one is active; `playAt(i)` picks it per-URL and `_switchMode()` pauses + hides the other two. Reports state via `playingIndex()` / `isPlaying()`.
- **`m3u.js`** — `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, plus `isYouTube(url)` / `youTubeId(url)` URL helpers. Track shape: `{ name, url }`.
- **`app.js`** — the controller. See above.

## Key behaviors and deliberate decisions

- **Auto-save, no Save button.** Any edit (add/delete/reorder) calls `scheduleSave()` → debounced 1 s → writes to Firestore. Does not re-render (won't disrupt focus).
- **Repeat is always ON.** `setRepeat(true)` at startup; there is no toggle UI.
- **Track rows are read-only.** The URL is hidden (hover tooltip only). To change a track, delete and re-add.
- **The `#viz` equalizer is decorative** — 8 CSS-animated bars driven only by `play`/`pause` state, not a real Web Audio analyser (cross-origin audio prevents `createMediaElementSource`).
- **No drag-to-reorder.** Uses ↑/↓ buttons — native HTML5 DnD is unreliable on touch screens.
- **Confirm popup before every delete** (`askConfirm()` returns `Promise<boolean>`).
- **SoundCloud support via SC Widget iframe.** Any track whose URL contains `soundcloud.com/` is played in an `<iframe id="sc-widget">` using `https://w.soundcloud.com/player/`. The SC Widget JS API (`https://w.soundcloud.com/player/api.js`, loaded in `<head>`) wires `FINISH` → auto-advance, `PLAY`/`PAUSE` → UI sync. The `<audio>` element is hidden while SC is active and vice versa. Both modes auto-advance correctly in mixed playlists. Known issue: switching between SC and audio tracks can briefly overlap audio (the SC widget's async pause); not yet fixed.
- **YouTube support via the IFrame Player API.** Any `youtube.com`/`youtu.be` track plays in a YouTube player inside `<div id="yt-widget">` (the API replaces the inner `#yt-player` div with its own `<iframe>`). The API script (`https://www.youtube.com/iframe_api`, loaded in `<head>`) calls `window.onYouTubeIframeAPIReady`; the player is created lazily on first use and a `pendingYTId` covers the case where a track is clicked before the API is ready. `onStateChange` wires `ENDED` → auto-advance and `PLAYING`/`PAUSED` → UI sync. The video shows as a small thumbnail in the player bar; **`#yt-toggle`** collapses it to audio-only by clipping the iframe to 1px (it keeps playing — `display:none` would pause it). `onError` (codes 101/150 = embedding disabled by the owner, 100/2/5 = removed/private/region-locked) shows a toast and **auto-advances** — a per-queue guard (`errorSkips`) stops it looping forever if every track is unplayable. There is no way to know a video is embed-blocked *before* play time. Like SC, switching modes can briefly overlap audio.

## Data model

Firestore collection `playlists`, one document per playlist:
```js
{ owner: "<uid>", name: "chill", tracks: [{ name, url }, …], updatedAt }
```
Tracks are an array inside the document. `duration` is never persisted.

## Do not attempt these (ruled out for concrete reasons)

- **Firebase Storage for files** — required CORS config + public IAM, and remote `.m3u` URLs are treated as a single stream by desktop players (AIMP, VLC), not expanded into multiple tracks. Only a **local `.m3u` file** expands. The Download button handles that case.
- **GitHub repo as storage with a client-side token** — tokens in public repos are auto-revoked by secret scanning.
- **SoundCloud API (v1/v2)** — no new API keys are issued; stream URLs require SoundCloud Go+. The Widget iframe approach is used instead (no API key needed, works on all public tracks).
- **YouTube audio-only / forcing embed-blocked videos** — there is no legitimate way to get a raw audio stream URL (extraction breaks YouTube's ToS, and the URLs are signed/short-lived), which is why the IFrame player (with video) is used. If a creator disables embedding, the video **cannot** be played in any iframe — not fixable client-side; the player just toasts and auto-skips. The embed-blocked state also can't be detected before play time (the Data API `embeddable` flag is unreliable).

## Known tech debt

- `auth.js` header comment still references "Firebase Storage / folder" — stale, ignore it.
- `config.js` still exports `appConfig.rootFolder = "playlists"` — dead code from the Storage era, unused.
- `player.js` exports `stop`, `prev`, `getRepeat` that `app.js` does not currently call.

## Firebase project

Project ID: `m3uplay-d9b1f`. `config.js` is **public by design** (no secrets). Firebase Storage, CORS, and IAM are **not used**.

The authoritative architecture doc is [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md).
