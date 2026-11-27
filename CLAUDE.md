# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

Must be served over **http(s), not `file://`** — ES modules and the Google sign-in popup require it.

```
python -m http.server 8000
# → http://localhost:8000
```

Also works via VS Code Live Server. The **app** has **no compilation step or package.json**. Standalone checks run with `node --test js/yt-channels/tests/api.test.mjs js/yt-channels/tests/preferences.test.mjs js/yt-channels/tests/prepare-pages.test.mjs` and `node js/yt-channels/tests/browser.mjs` (the latter needs Chrome/Edge). No npm install is needed. GitHub Pages packaging injects the browser config into an artifact; a separate Node script + GitHub Action snapshots daily trends.

Live deployment: `https://ephedrine2010.github.io/m3uplay-ephedrine/` (GitHub Pages, source `main`). The new `.github/workflows/pages.yml` requires **Settings → Pages → Source: GitHub Actions**; it deploys a prepared artifact rather than publishing the branch directly.

## Architecture

Vanilla HTML/CSS/JS — no framework, no bundler. Modules are native ES modules (`<script type="module">`). Firebase SDK is loaded directly from `https://www.gstatic.com/firebasejs/10.12.2/...` — **no npm install**.

**`js/app.js` is the only application-state controller.** It holds account/playlist state plus `channels`, `channelFeeds`, channel loading/errors and the selected `channelVideo`, and wires effects into the feature views. Render modules build DOM; engines retain SDK state, the channel dialog retains transient UI state, and the YouTube API factory keeps a disposable session cache.

Module responsibilities:
- **`firebase.js`** — initializes Firebase once, exports `app`. Shared by auth and firestore.
- **`auth.js`** — `watchAuth(cb)`, `signIn()`, `signOutUser()`. Google popup sign-in only.
- **`firestore.js`** — playlist CRUD. `listPlaylists` queries `where("owner","==",uid)`, excludes `kind: "youtube-channel"` records and sorts client-side (avoids a composite index).
- **`js/yt-channels/`** — personal YouTube channels, shown **above** the trends on the home page. Contains all feature JS, CSS, tests and [its reference/setup guide](js/yt-channels/README.md). `api.js` resolves channel handles/URLs using `channels.list` and loads up to 12 recent uploads using `playlistItems.list`; `storage.js` saves owner-scoped channel records in the existing `playlists` collection; `index.js`, `view.js` and `dialog.js` render the section, add/preview dialog, menus, thumbnail rails, shared player popup and Watch-on-YouTube fallback. Account and feed state stays in `app.js`. **Setup:** add the dedicated website/YouTube-restricted browser key as GitHub repository secret `YT_BROWSER_API_KEY`; `prepare-pages.mjs` generates the artifact config. Leave tracked config empty and keep this browser key separate from the Firebase key; the legacy trends YT_API_KEY is unused.
- **`player.js`** — the player **coordinator**. Owns the queue + current index and delegates playback to one of the per-source engines in **`js/players/`**, chosen per-URL via each engine's `matches(url)`. Only one engine is active at a time; `_activate()` stops + hides the others so they never overlap. Owns auto-advance (`next`), the auto-skip guard (`errorSkips`) and the `onChange`/`notify` callbacks the engines report back through. Reports state via `playingIndex()` / `isPlaying()`. Also exposes `playOneOff(track)` for ad-hoc plays that are **not** part of a saved playlist (used by the trends board): it replaces the queue with one item and **stops at the end instead of repeating** (guarded by an internal `oneOff` flag, cleared by `setQueue`). `currentTrack()` returns the actual current item so the now-playing label is correct for one-offs too; `isOneOff()` lets the app stop a preview when a playlist is opened.
- **`js/trends_board/*.js`** — the **discovery board** ("Trending in Egypt"), the landing view in `#content`. Pure render modules (`dom`, `card`, `tile`, `band`, `board`, `image`, `sources`) + `rail.js` (the horizontal carousel: ‹ › nav, wheel→horizontal, drag-to-pan, edge fades) + `data.js` (fetches `data/trending.json`), `deezer.js` (resolves a fresh Deezer preview URL via JSONP at click-time), and `actions.js` (the hybrid click dispatch). `index.js` exposes `initTrendsBoard({ mount, deps }) → { show, hide }`; the board never imports app/player directly — player, preview-resolver, open-in-new-tab and notify are **injected** as `deps`. Full reference: [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).
- **`js/players/*.js`** — one engine per source, each exposing the **same interface**: `init(el, callbacks)`, `matches(url)`, `play(url)`, `pause()`, `resume()`, `stop()`, `isPlaying()`, `setActive(on)`. `audio.js` (native `<audio>`, the catch-all — `matches()` always `true`, kept last), `soundcloud.js` (SC Widget iframe), `youtube.js` (YouTube IFrame API). Engines hold their own DOM/SDK state; they never touch the queue — they call back into the coordinator (`onPlay`/`onPause`/`onEnded`/`onError`).
- **`m3u.js`** — `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, `extractUrl(text)` (pulls the URL out of pasted share text, e.g. a sentence + link), plus `isYouTube(url)` / `youTubeId(url)` URL helpers. Track shape: `{ name, url }`.
- **`app.js`** — the controller. See above.

## Key behaviors and deliberate decisions

- **GitHub secret → deployment config.** Add the dedicated website/YouTube-restricted browser key as repository secret **`YT_BROWSER_API_KEY`**. Keep `apiKey: ""` in tracked `js/yt-channels/config.js`. `.github/workflows/pages.yml` passes the secret through an environment variable to `js/yt-channels/prepare-pages.mjs`, which copies runtime assets into ignored `_site/` and writes the key only to the artifact's config. It fails before packaging if the secret is empty and never logs the value. Run **Actions → Deploy M3U Player** after changing a secret; pushes to `main` also deploy. Successful daily trends refreshes trigger a deployment via `workflow_run` because the bot's `GITHUB_TOKEN` push does not trigger push workflows. Only this repository's trusted `main` is deployed. Local servers cannot read GitHub secrets; a local configured preview can package `_site/` using the same environment variable. The deployed browser key remains public and restricted. Deezer/Apple trends need no API key; the legacy `YT_API_KEY` secret is no longer used.
- **Home = personal channels first, trends below.** `#discovery-home` inside `#content` is the single vertical scroll container, holding `#yt-channels` then `#trends-board`. Opening a playlist swaps the whole home view for the track list; the **🎵 brand** brings it back. Trends use the same-origin daily `data/trending.json` snapshot: **Deezer** previews in-app and **Apple Music** opens in a new tab. **The YouTube trends row, Anghami and Spotify are removed** from the generator, snapshot and renderer (including old cached snapshots). **Personal YouTube channels remain available above trends**, using their existing restricted browser credential and shared player. Deezer still stores only permanent IDs and resolves expiring previews at click-time. See [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md) and [`js/yt-channels/README.md`](js/yt-channels/README.md).
- **Personal channel flow:** Add channel → paste `@handle` or channel URL → Find channel → confirm the preview → Add. New channels appear first; each row has up to 12 recent video thumbnails and Refresh. The **⋯** menu offers Open on YouTube and Remove channel; removal uses `askConfirm()` and updates the account only after a successful delete. Channel lists reload on sign-in/page load (no realtime listener); feed cache is memory-only for 10 minutes. Requests are cancelled and late results discarded when the account changes.
- **Channel layout is personal and persisted.** Each header has an **⠿** drag handle for mouse/touch, **▾/▸** collapse, and **Move up / Move down** menu options. Focus the handle and use ↑/↓ for keyboard movement. `js/yt-channels/reorder.js` uses Pointer Events, a floating header preview and edge scrolling; it saves only on drop and cancels with Escape/pointer cancellation. `preferences.js` validates and arranges the list; Firestore saves positions in one atomic batch and collapse as a per-record field update. `app.js` owns optimistic state and rollback, with layout edits disabled during saves and account-session guards. Row DOM/video-rail scroll is preserved on reorder/collapse, and feed DOM updates wait until dragging ends. Legacy channel records keep newest-added order until reordered; new channels still appear first.
- **Compact discovery controls.** The personal-channel section has no visible title, description or drag-help paragraph. Its add action is a compact **＋ icon button**, with tooltip and accessible label **Add YouTube channel**. The former trends Tip banner is removed. Each Deezer/Apple trend header has its own **▾/▸** collapse button using `aria-expanded`/`aria-controls`; it hides the existing body without rebuilding the rail or changing playback. Trend collapse is view-only state retained during playlist navigation and reset on full reload; personal-channel collapse remains account-persisted.
- **Lookup setup failures are not missing channels.** An empty `js/yt-channels/config.js` browser key prevents any YouTube request. The UI explicitly says lookup has not been set up; invalid keys, website restrictions and disabled API access have separate messages. See the feature README's troubleshooting table. The two reported URLs (`@SharkTankEgypt`, `@NagdyWP`) use the supported handle format; a configured key is still required.
- **One shared channel video player in a popup.** Thumbnail clicks open a responsive native `<dialog>` on the same page using the existing YouTube engine. Its bottom Play/Pause state is synchronized. **×**, **Escape** or backdrop click stops playback and dismisses the popup; close it to choose another thumbnail. Opening a playlist or starting a trend also closes it. An embed failure preserves the selected video and shows an explicit **Watch on YouTube ↗** link to that video in a new tab; navigation is never automatic. `setYouTubeHost()` recreates the SDK instance when moving between dialog and bottom bar to avoid stale iframe state. Stop clears pending lazy playback.
- **Rails scroll horizontally, the pane does not.** Trends and channel rows share `js/trends_board/rail.js`: ‹ › navigation, wheel→horizontal panning with vertical release at the ends, and mouse drag-to-pan. Keep **`min-width: 0`** on `#content`, `#discovery-home`, `#trends-board`, `.tb-board` and channel containers. Dynamic channel rails expose `dispose()` to release their resize observer when replaced.
- **Auto-save, no Save button.** Any edit (add/delete/reorder) calls `scheduleSave()` → debounced 1 s → writes to Firestore. Does not re-render (won't disrupt focus).
- **Repeat is always ON.** `setRepeat(true)` at startup; there is no toggle UI.
- **Track rows are read-only.** The URL is hidden (hover tooltip only). To change a track, delete and re-add.
- **The `#viz` equalizer is decorative** — 8 CSS-animated bars driven only by `play`/`pause` state, not a real Web Audio analyser (cross-origin audio prevents `createMediaElementSource`).
- **Playlist track reordering uses ↑/↓ buttons.** Channel rows support dragging through Pointer Events; do not substitute native HTML5 DnD, which is unreliable on touch screens.
- **Confirm popup before every delete** (`askConfirm()` returns `Promise<boolean>`).
- **SoundCloud support via SC Widget iframe.** Any track whose URL contains `soundcloud.com/` is played in an `<iframe id="sc-widget">` using `https://w.soundcloud.com/player/`. The SC Widget JS API (`https://w.soundcloud.com/player/api.js`, loaded in `<head>`) wires `FINISH` → auto-advance, `PLAY`/`PAUSE` → UI sync. The `<audio>` element is hidden while SC is active and vice versa. Both modes auto-advance correctly in mixed playlists. Known issue: switching between SC and audio tracks can briefly overlap audio (the SC widget's async pause); not yet fixed.
- **YouTube support via the IFrame Player API.** `js/players/youtube.js` lazily creates a `YT.Player` inside `#yt-widget`; the SDK replaces `#yt-player` with an iframe. `pendingId` handles clicks before the SDK is ready and is cleared on stop. `PLAYING`/`PAUSED` update the app; `ENDED` advances playlists or stops one-offs. Playlist playback uses the existing bottom thumbnail and `#yt-toggle`; personal channels use the larger panel, with that toggle hidden. Errors 101/150 identify creator-disabled embedding; other errors show a general unavailable message. Playlists auto-skip with the all-unplayable guard; channel one-offs retain identity for their explicit external link. `origin` is passed to the SDK. See the feature README for host-switching details.

## Data model

Firestore collection `playlists`, one document per playlist:
```js
{ owner: "<uid>", name: "chill", tracks: [{ name, url }, …], updatedAt }
```
Tracks are an array inside the document. `duration` is never persisted.

The same owner-protected collection also contains personal channel records at
`playlists/{uid}_yt_{channelId}`:
```js
{ owner: "<uid>", kind: "youtube-channel", channelId, title, handle, thumb,
  uploadsId, url, addedAt, position, collapsed }
```
`listPlaylists` must exclude these records; channel queries filter `kind`
client-side after querying the owner. The deterministic ID prevents duplicate
saved channels. The documented owner rules already allow this shape; no new
collection, composite index or rule deployment is required.

## Do not attempt these (ruled out for concrete reasons)

- **Firebase Storage for files** — required CORS config + public IAM, and remote `.m3u` URLs are treated as a single stream by desktop players (AIMP, VLC), not expanded into multiple tracks. Only a **local `.m3u` file** expands. The Download button handles that case.
- **GitHub repo as storage with a client-side token** — tokens in public repos are auto-revoked by secret scanning.
- **SoundCloud API (v1/v2)** — no new API keys are issued; stream URLs require SoundCloud Go+. The Widget iframe approach is used instead (no API key needed, works on all public tracks).
- **YouTube audio-only / forcing embed-blocked videos** — keep playback in the existing iframe engine. Creator restrictions cannot be bypassed. Saved playlists toast and auto-skip blocked videos; personal-channel one-offs retain the video and offer Watch on YouTube. Do not promise that metadata can guarantee embedding will work before play time.
- **Anghami** — previous investigation found third-party framing blocked by CSP/X-Frame-Options, including its embed endpoint. Do not reintroduce the removed iframe engine. Its trends tile was also removed at the user's request.
- **Spotify** — playback was previously skipped because the embed's full-track behavior depends on Spotify Premium/browser sign-in and a full SDK integration adds OAuth complexity. Its trends tile was removed at the user's request.
- **Deezer full tracks** — the board uses Deezer's public API (no key) for the Egypt chart, but plays only the **30-second `preview` MP3** in-app. Full tracks would need the (paywalled) Deezer streaming SDK. Preview URLs are **signed and expire in ~15 min**, so they are resolved fresh at click-time via JSONP (never cached in the snapshot) — see [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).

## Known tech debt

- `auth.js` header comment still references "Firebase Storage / folder" — stale, ignore it.
- `player.js` exports `prev`, `getRepeat` that `app.js` does not currently call. (`stop` **is** now called — by the trends board wiring when a playlist is opened mid-preview.)

## Firebase project

Project ID: `m3uplay-d9b1f`. `config.js` is **public by design** (no secrets). Firebase Storage, CORS, and IAM are **not used**.

The authoritative architecture doc is [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md). The trends reference is [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md). Personal channel behavior, API-key setup, storage and verification are documented in [`js/yt-channels/README.md`](js/yt-channels/README.md).
