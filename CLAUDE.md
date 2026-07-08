# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

Must be served over **http(s), not `file://`** — ES modules and the Google sign-in popup require it.

```
python -m http.server 8000
# → http://localhost:8000
```

Also works via VS Code Live Server. The **app** has **no build step, no package.json, no test suite**. (There is now a standalone Node script + GitHub Action that snapshots the trends data — separate infra, not part of the app build. See the trends board section.)

Live deployment: `https://ephedrine2010.github.io/m3uplay-ephedrine/` (GitHub Pages, branch `main`).

## Architecture

Vanilla HTML/CSS/JS — no framework, no bundler. Modules are native ES modules (`<script type="module">`). Firebase SDK is loaded directly from `https://www.gstatic.com/firebasejs/10.12.2/...` — **no npm install**.

**`app.js` is the only stateful controller.** It holds `state = { uid, playlists[], current, tracks[] }` and wires every DOM event to the other modules. The other JS files are pure-function modules with no global state of their own.

Module responsibilities:
- **`firebase.js`** — initializes Firebase once, exports `app`. Shared by auth and firestore.
- **`auth.js`** — `watchAuth(cb)`, `signIn()`, `signOutUser()`. Google popup sign-in only.
- **`firestore.js`** — playlist CRUD. `listPlaylists` queries `where("owner","==",uid)` and sorts client-side (avoids a composite index).
- **`player.js`** — the player **coordinator**. Owns the queue + current index and delegates playback to one of the per-source engines in **`js/players/`**, chosen per-URL via each engine's `matches(url)`. Only one engine is active at a time; `_activate()` stops + hides the others so they never overlap. Owns auto-advance (`next`), the auto-skip guard (`errorSkips`) and the `onChange`/`notify` callbacks the engines report back through. Reports state via `playingIndex()` / `isPlaying()`. Also exposes `playOneOff(track)` for ad-hoc plays that are **not** part of a saved playlist (used by the trends board): it replaces the queue with one item and **stops at the end instead of repeating** (guarded by an internal `oneOff` flag, cleared by `setQueue`). `currentTrack()` returns the actual current item so the now-playing label is correct for one-offs too; `isOneOff()` lets the app stop a preview when a playlist is opened.
- **`js/trends_board/*.js`** — the **discovery board** ("Trending in Egypt"), the landing view in `#content`. Pure render modules (`dom`, `card`, `tile`, `band`, `board`, `image`, `sources`) + `data.js` (fetches `data/trending.json`), `deezer.js` (resolves a fresh Deezer preview URL via JSONP at click-time), and `actions.js` (the hybrid click dispatch). `index.js` exposes `initTrendsBoard({ mount, deps }) → { show, hide }`; the board never imports app/player directly — player, preview-resolver, open-in-new-tab and notify are **injected** as `deps`. Full reference: [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).
- **`js/players/*.js`** — one engine per source, each exposing the **same interface**: `init(el, callbacks)`, `matches(url)`, `play(url)`, `pause()`, `resume()`, `stop()`, `isPlaying()`, `setActive(on)`. `audio.js` (native `<audio>`, the catch-all — `matches()` always `true`, kept last), `soundcloud.js` (SC Widget iframe), `youtube.js` (YouTube IFrame API). Engines hold their own DOM/SDK state; they never touch the queue — they call back into the coordinator (`onPlay`/`onPause`/`onEnded`/`onError`).
- **`m3u.js`** — `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, `extractUrl(text)` (pulls the URL out of pasted share text, e.g. a sentence + link), plus `isYouTube(url)` / `youTubeId(url)` URL helpers. Track shape: `{ name, url }`.
- **`app.js`** — the controller. See above.

## Key behaviors and deliberate decisions

- **Trends board is the landing view.** `js/trends_board/` renders "Trending in Egypt" into `#content` on login; opening a playlist swaps it for the track list; clicking the **🎵 brand** brings it back. Data comes from `data/trending.json` (fetched same-origin — no CORS, no API keys in the browser), snapshotted daily by `scripts/fetch-trends.mjs` via `.github/workflows/trends.yml`. **Hybrid actions** per source: Deezer plays a 30s preview in-app, YouTube plays full in-app (once keyed), Apple/Anghami/Spotify open in a new tab. **Non-obvious gotcha:** Deezer preview URLs expire in ~15 min, so the snapshot stores only the permanent `deezerId` and the client resolves a fresh preview at click-time via JSONP. Anghami/Spotify/YouTube-without-key appear as link-out **tiles**. Full details: [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).
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
- **Anghami** — cannot be embedded or played at all. **Every** Anghami endpoint blocks third-party framing server-side: `open.anghami.com/<code>` short links send `CSP: frame-ancestors 'self'`, `play.anghami.com/song/<id>` sends `X-Frame-Options: DENY`, and even Anghami's own embed endpoint `www.anghami.com/embed/song/<id>` sends `X-Frame-Options: SAMEORIGIN` (renders only on anghami.com). No URL we can put in an `<iframe>` will render — the browser refuses. Anghami's public "embed widget" appears effectively dead for third-party sites. (An earlier iframe attempt was removed once these headers were confirmed.) There is no JS API or stream URL either. Dead end for *playback* — but the trends board still surfaces the Egypt chart as a **link-out tile** (opening it on Anghami is always allowed).
- **Spotify** — investigated and skipped for *playback*. Its iFrame Embed API is actually a *good* technical fit (real `play`/`pause`/`seek` + a `playback_update` event), but the embed plays **only 30-second previews** for anyone who isn't signed into Spotify **Premium in that same browser**. Full-track playback needs the Web Playback SDK (OAuth + Premium token) — too heavy for a preview-only payoff. Like Anghami, it appears in the trends board only as a **link-out tile**.
- **Deezer full tracks** — the board uses Deezer's public API (no key) for the Egypt chart, but plays only the **30-second `preview` MP3** in-app. Full tracks would need the (paywalled) Deezer streaming SDK. Preview URLs are **signed and expire in ~15 min**, so they are resolved fresh at click-time via JSONP (never cached in the snapshot) — see [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).

## Known tech debt

- `auth.js` header comment still references "Firebase Storage / folder" — stale, ignore it.
- `config.js` still exports `appConfig.rootFolder = "playlists"` — dead code from the Storage era, unused.
- `player.js` exports `prev`, `getRepeat` that `app.js` does not currently call. (`stop` **is** now called — by the trends board wiring when a playlist is opened mid-preview.)

## Firebase project

Project ID: `m3uplay-d9b1f`. `config.js` is **public by design** (no secrets). Firebase Storage, CORS, and IAM are **not used**.

The authoritative architecture doc is [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md). The discovery board has its own reference: [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).
