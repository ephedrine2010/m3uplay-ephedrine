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
- **`player.js`** — the player **coordinator**. Owns the queue + current index and delegates playback to one of the per-source engines in **`js/players/`**, chosen per-URL via each engine's `matches(url)`. Only one engine is active at a time; `_activate()` stops + hides the others so they never overlap. Owns auto-advance (`next`), the auto-skip guard (`errorSkips`) and the `onChange`/`notify` callbacks the engines report back through. Reports state via `playingIndex()` / `isPlaying()`. Public API (`initPlayer`, `setQueue`, `playAt`, `pause`, `resume`, `isPlaying`, …) is unchanged from the old single-file version.
- **`js/players/*.js`** — one engine per source, each exposing the **same interface**: `init(el, callbacks)`, `matches(url)`, `play(url)`, `pause()`, `resume()`, `stop()`, `isPlaying()`, `setActive(on)`. `audio.js` (native `<audio>`, the catch-all — `matches()` always `true`, kept last), `soundcloud.js` (SC Widget iframe), `youtube.js` (YouTube IFrame API), `anghami.js` (plain embed iframe, **no JS API**). Engines hold their own DOM/SDK state; they never touch the queue — they call back into the coordinator (`onPlay`/`onPause`/`onEnded`/`onError`).
- **`m3u.js`** — `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, plus `isYouTube(url)` / `youTubeId(url)` and `isAnghami(url)` / `anghamiEmbedUrl(url)` URL helpers. Track shape: `{ name, url }`.
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
- **Anghami support via a plain embed iframe (no JS API).** Any track whose URL contains `anghami.com/` is loaded in `<iframe id="angh-widget">`, with the host normalized to `play.anghami.com` (`anghamiEmbedUrl()`) because the marketing site (`www.anghami.com`) blocks framing. Anghami exposes **no widget JS API**, which drives three deliberate consequences: (1) the user plays/pauses with Anghami's own buttons *inside* the frame — our transport bar can't control it; (2) `isPlaying()` always returns `false` for `"angh"` (we can't know its state, so the `#viz` equalizer and row icons don't reflect it); (3) the queue **does not auto-advance** off an Anghami track (no FINISH event). Because there's no `pause()` either, the only way to silence it when switching tracks is to **unload the iframe** (the engine's `stop()` sets `src="about:blank"`), which the coordinator calls on the outgoing engine in `_activate()` — this prevents the background-overlap bug but loses the track's position. Playback is typically **preview-only** unless the listener is signed into Anghami Plus inside the widget.

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
- **Spotify** — investigated and skipped. Its iFrame Embed API is actually a *good* technical fit (real `play`/`pause`/`seek` + a `playback_update` event, unlike Anghami's control-less embed), but the embed plays **only 30-second previews** for anyone who isn't signed into Spotify **Premium in that same browser**. Full-track playback needs the Web Playback SDK (OAuth + Premium token) — too heavy for a preview-only payoff. Not worth wiring up.

## Known tech debt

- `auth.js` header comment still references "Firebase Storage / folder" — stale, ignore it.
- `config.js` still exports `appConfig.rootFolder = "playlists"` — dead code from the Storage era, unused.
- `player.js` exports `stop`, `prev`, `getRepeat` that `app.js` does not currently call.

## Firebase project

Project ID: `m3uplay-d9b1f`. `config.js` is **public by design** (no secrets). Firebase Storage, CORS, and IAM are **not used**.

The authoritative architecture doc is [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md).
