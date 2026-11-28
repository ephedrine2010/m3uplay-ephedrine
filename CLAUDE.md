# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

Must be served over **http(s), not `file://`** — ES modules and the Google sign-in popup require it.

```
python -m http.server 8000
# → http://localhost:8000
```

Also works via VS Code Live Server. The **app** has **no compilation step or package.json**. Standalone checks run with `node --test js/yt-channels/tests/*.test.mjs` and `node js/yt-channels/tests/browser.mjs` (the latter needs Chrome/Edge). No npm install is needed. GitHub Pages packaging injects the browser config into an artifact; a separate Node script + GitHub Action snapshots daily trends.

Live deployment: `https://ephedrine2010.github.io/m3uplay-ephedrine/` (GitHub Pages, source `main`). The new `.github/workflows/pages.yml` requires **Settings → Pages → Source: GitHub Actions**; it deploys a prepared artifact rather than publishing the branch directly.

## Architecture

Vanilla HTML/CSS/JS — no framework, no bundler. Modules are native ES modules (`<script type="module">`). Firebase SDK is loaded directly from `https://www.gstatic.com/firebasejs/10.12.2/...` — **no npm install**.

**`js/app.js` is the only application-state controller.** It holds account/playlist state plus `channels`, `channelFeeds`, channel loading/errors, the selected `channelVideo` or `playlistVideo`, and `playlistReturnIndex` for popup focus restoration. It wires effects into the feature views. Render modules build DOM; engines retain SDK state, import/channel dialogs retain transient UI state, and the YouTube API factory keeps a disposable channel-feed cache.

Module responsibilities:
- **`css/apple.css`, `js/icons.js`, `js/ui.js`** — the owner-approved Apple UI, adapted from `.claude/skills/pos-apple-design/`. CSS loads last and centralizes light/dark tokens; icons are static outline Tabler SVGs. `ui.js` owns device-local appearance (`m3u-appearance`, defaults to system) and the ≤800 px library drawer's focus/inert/Escape lifecycle, not application state. Playlist creation/add/delete now use native dialogs. Home toolbar holds the + channel icon; playlist toolbar holds track actions. Desktop Refresh is an icon and is also available in the channel menu. Cards keep their 1 px edge and no shadow. See [`documents/APPLE_UI.md`](documents/APPLE_UI.md); the original standalone proposal remains in [`design/apple-ui/preview.html`](design/apple-ui/preview.html).
- **`firebase.js`** — initializes Firebase once, exports `app`. Shared by auth and firestore.
- **`auth.js`** — `watchAuth(cb)`, `signIn()`, `signOutUser()`. Google popup sign-in only.
- **`firestore.js`** — playlist CRUD and atomic `savePlaylistOrder`. `listPlaylists` queries `where("owner","==",uid)`, excludes `kind: "youtube-channel"` records and sorts client-side by saved position, then alphabetical fallback (avoids a composite index). `js/playlist-order.js` compares and validates complete library orders.
- **`js/yt-channels/`** — personal YouTube channels, shown **above** the trends on the home page. Contains all feature JS, CSS, tests and [its reference/setup guide](js/yt-channels/README.md). `api.js` resolves channel handles/URLs using `channels.list` and loads up to 12 recent uploads using `playlistItems.list`; `storage.js` saves owner-scoped channel records in the existing `playlists` collection; `index.js`, `view.js` and `dialog.js` render the section, add/preview dialog, menus, thumbnail rails, shared player popup and Watch-on-YouTube fallback. Account and feed state stays in `app.js`. **Setup:** add the dedicated website/YouTube-restricted browser key as GitHub repository secret `YT_BROWSER_API_KEY`; `prepare-pages.mjs` generates the artifact config. Leave tracked config empty and keep this browser key separate from the Firebase key; the legacy trends YT_API_KEY is unused.
- **`js/yt-playlists/`** — YouTube playlist import dialog and [feature reference](js/yt-playlists/README.md). `dialog.js` owns transient preview/name/save state; `app.js` owns imported lists and rendering. Shared `js/yt-channels/api.js` exports `parsePlaylistInput` and `resolvePlaylist`; it fetches playlist metadata and every page in source order. `firestore.js:createPlaylist(uid, name, tracks, metadata)` accepts optional YouTube source fields. Shared tests remain under `js/yt-channels/tests/`.
- **`player.js`** — the player **coordinator**. Owns the queue + current index and delegates playback to one of the per-source engines in **`js/players/`**, chosen per-URL via each engine's `matches(url)`. Only one engine is active at a time; `_activate()` stops + hides the others so they never overlap. Owns auto-advance (`next`), the auto-skip guard (`errorSkips`) and the `onChange`/`notify` callbacks the engines report back through. Reports state via `playingIndex()` / `isPlaying()`. Also exposes `playOneOff(track)` for ad-hoc plays that are **not** part of a saved playlist (used by the trends board): it replaces the queue with one item and **stops at the end instead of repeating** (guarded by an internal `oneOff` flag, cleared by `setQueue`). `currentTrack()` returns the actual current item so the now-playing label is correct for one-offs too; `isOneOff()` lets the app stop a preview when a playlist is opened.
- **`js/trends_board/*.js`** — the **discovery board** ("Trending in Egypt"), the landing view in `#content`. Pure render modules (`dom`, `card`, `tile`, `band`, `board`, `image`, `sources`) + `rail.js` (the horizontal carousel: ‹ › nav, wheel→horizontal, drag-to-pan, edge fades) + `data.js` (fetches `data/trending.json`), `deezer.js` (resolves a fresh Deezer preview URL via JSONP at click-time), and `actions.js` (the hybrid click dispatch). `index.js` exposes `initTrendsBoard({ mount, deps }) → { show, hide }`; the board never imports app/player directly — player, preview-resolver, open-in-new-tab and notify are **injected** as `deps`. Full reference: [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md).
- **`js/players/*.js`** — one engine per source, each exposing the **same interface**: `init(el, callbacks)`, `matches(url)`, `play(url)`, `pause()`, `resume()`, `stop()`, `isPlaying()`, `setActive(on)`. `audio.js` (native `<audio>`, the catch-all — `matches()` always `true`, kept last), `soundcloud.js` (SC Widget iframe), `youtube.js` (YouTube IFrame API). Engines hold their own DOM/SDK state; they never touch the queue — they call back into the coordinator (`onPlay`/`onPause`/`onEnded`/`onError`).
- **`m3u.js`** — `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, `extractUrl(text)` (pulls the URL out of pasted share text, e.g. a sentence + link), plus `isYouTube(url)` / `youTubeId(url)` URL helpers. Saved tracks require `{ name, url }` and may include `thumb` and `channelTitle`; M3U export does not round-trip those optional fields or playlist source metadata.
- **`app.js`** — the controller. See above.

## Key behaviors and deliberate decisions

- **GitHub secret → deployment config.** Add the dedicated website/YouTube-restricted browser key as repository secret **`YT_BROWSER_API_KEY`**. Keep `apiKey: ""` in tracked `js/yt-channels/config.js`. `.github/workflows/pages.yml` passes the secret through an environment variable to `js/yt-channels/prepare-pages.mjs`, which copies runtime assets into ignored `_site/` and writes the key only to the artifact's config. It fails before packaging if the secret is empty and never logs the value. Run **Actions → Deploy M3U Player** after changing a secret; pushes to `main` also deploy. Successful daily trends refreshes trigger a deployment via `workflow_run` because the bot's `GITHUB_TOKEN` push does not trigger push workflows. Only this repository's trusted `main` is deployed. Local servers cannot read GitHub secrets; a local configured preview can package `_site/` using the same environment variable. The deployed browser key remains public and restricted. Deezer/Apple trends need no API key; the legacy `YT_API_KEY` secret is no longer used.
- **Home = personal channels first, trends below.** `#discovery-home` inside `#content` is the single vertical scroll container, holding `#yt-channels` then `#trends-board`. Opening a playlist swaps the whole home view for the track list; the **🎵 brand** brings it back. Trends use the same-origin daily `data/trending.json` snapshot: **Deezer** previews in-app and **Apple Music** opens in a new tab. **The YouTube trends row, Anghami and Spotify are removed** from the generator, snapshot and renderer (including old cached snapshots). **Personal YouTube channels remain available above trends**, using their existing restricted browser credential and shared player. Deezer still stores only permanent IDs and resolves expiring previews at click-time. See [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md) and [`js/yt-channels/README.md`](js/yt-channels/README.md).
- **Personal channel flow:** Add channel → paste `@handle` or channel URL → Find channel → confirm the preview → Add. New channels appear first; each row has up to 12 recent video thumbnails and Refresh. The **⋯** menu offers Open on YouTube and Remove channel; removal uses `askConfirm()` and updates the account only after a successful delete. Channel lists reload on sign-in/page load (no realtime listener); feed cache is memory-only for 10 minutes. Requests are cancelled and late results discarded when the account changes.
- **Channel layout is personal and persisted.** Each header has an **⠿** drag handle for mouse/touch, **▾/▸** collapse, and **Move up / Move down** menu options. Focus the handle and use ↑/↓ for keyboard movement. `js/yt-channels/reorder.js` uses Pointer Events, a floating header preview and edge scrolling; it saves only on drop and cancels with Escape/pointer cancellation. `preferences.js` validates and arranges the list; Firestore saves positions in one atomic batch and collapse as a per-record field update. `app.js` owns optimistic state and rollback, with layout edits disabled during saves and account-session guards. Row DOM/video-rail scroll is preserved on reorder/collapse, and feed DOM updates wait until dragging ends. Legacy channel records keep newest-added order until reordered; new channels still appear first.
- **Sidebar playlist order is personal and persisted.** Every manual, M3U and YouTube playlist has a `.pl-drag-handle`; drag vertically with mouse/touch or focus the grip and use ↑/↓. `enableListReorder` in `js/yt-channels/reorder.js` shares the existing pointer logic while preserving `enableChannelReorder` defaults. It previews without writes, scrolls the sidebar at its edges and cancels with Escape/pointer cancellation; Escape during a drag keeps the mobile drawer open. `arrangePlaylists` validates full membership, and `savePlaylistOrder` atomically updates only `position`. Legacy lists stay alphabetical until reordered; positioned lists precede unpositioned/new lists, which sort alphabetically. Reordering leaves the selected list/playback intact. Busy controls prevent competing library edits; failure restores positions while retaining current track metadata. Account-session guards discard late save UI updates. This order is independent of channel row order and playlist track order.
- **Compact discovery controls.** The personal-channel section has no visible title, description or drag-help paragraph. Its add action is a compact **＋ icon button**, with tooltip and accessible label **Add YouTube channel**. The former trends Tip banner is removed. Each Deezer/Apple trend header has its own **▾/▸** collapse button using `aria-expanded`/`aria-controls`; it hides the existing body without rebuilding the rail or changing playback. Trend collapse is view-only state retained during playlist navigation and reset on full reload; personal-channel collapse remains account-persisted.
- **Lookup setup failures are not missing channels.** An empty `js/yt-channels/config.js` browser key prevents any YouTube request. The UI explicitly says lookup has not been set up; invalid keys, website restrictions and disabled API access have separate messages. See the feature README's troubleshooting table. The two reported URLs (`@SharkTankEgypt`, `@NagdyWP`) use the supported handle format; a configured key is still required.
- **Playlist source menu and editable imports.** The rail's **+** opens Create empty playlist / Add YouTube playlist / Import M3U file. YouTube import previews a public link containing `list=`, permits a local name, and creates an editable snapshot; it does not sync with or write to YouTube. It shares `YT_BROWSER_API_KEY` with channels, needs no additional OAuth, and rejects Mixes/Watch later/history. Imports preserve source order and repeated videos, skip invalid/private/deleted entries, and fail without partial saving above 500 source entries or 750,000 bytes of serialized track metadata. Do not apply the channel feed's newest-first sorting, deduplication or 12-video limit to imports.
- **Thumbnail presentation follows playlist source; playback follows each item's URL.** `source: "youtube"` selects the responsive grid, including after users add audio/SoundCloud tracks. Manual/M3U lists retain editable rows with smaller artwork. Use saved HTTPS `thumb`, a generated YouTube thumbnail for valid video URLs, or a music placeholder. Preserve optional `thumb` and `channelTitle` through selection, reordering and saving. Artwork lookup for SoundCloud and M3U artwork-tag parsing are not implemented.
- **One shared YouTube popup for channels and saved playlists.** The native `.yc-player` dialog is mounted under `document.body`, outside the Home container that hides on playlist selection. Any playlist's YouTube item uses it. `prepareTrackPlayback` is passed as `initPlayer`'s final `beforePlay` callback and selects the host before loading each track, including auto-advance. Audio/SoundCloud items use the bottom bar; returning to YouTube reopens the popup. Consecutive YouTube items reuse the SDK instance; `setYouTubeHost()` recreates it only when its host changes. Popup, bottom transport and selected card stay synchronized. **×**, **Escape** or backdrop click stops playback; playlist popup close restores thumbnail focus. Selecting a playlist, Home or a trend closes the popup. Channel one-offs retain a failed video's exact Watch on YouTube link; saved queues auto-skip errors with the all-unplayable guard. Stop clears pending lazy playback. Previous/Next controls have not been added to the dialog.
- **Rails scroll horizontally, the pane does not.** Trends and channel rows share `js/trends_board/rail.js`: ‹ › navigation, wheel→horizontal panning with vertical release at the ends, and mouse drag-to-pan. Keep **`min-width: 0`** on `#content`, `#discovery-home`, `#trends-board`, `.tb-board` and channel containers. Dynamic channel rails expose `dispose()` to release their resize observer when replaced.
- **Auto-save, no Save button.** Edits update the local playlist cache and call `scheduleSave()` → debounced 1 s → Firestore. Selecting another playlist or Home flushes pending edits. `persist()` captures the playlist ID, UID and cleaned tracks before awaiting a write; never save a delayed edit against whichever list happens to be selected later. Account changes cancel pending timers, close import previews and clear the old library. Saving does not re-render.
- **Repeat is always ON.** `setRepeat(true)` at startup; there is no toggle UI.
- **Track rows are read-only.** The URL is hidden (hover tooltip only). To change a track, delete and re-add.
- **The `#viz` equalizer is decorative** — 8 CSS-animated bars driven only by `play`/`pause` state, not a real Web Audio analyser (cross-origin audio prevents `createMediaElementSource`).
- **Playlist track reordering uses ↑/↓ buttons.** Channel rows support dragging through Pointer Events; do not substitute native HTML5 DnD, which is unreliable on touch screens.
- **Confirm popup before every delete** (`askConfirm()` returns `Promise<boolean>`).
- **SoundCloud support via SC Widget iframe.** Any track whose URL contains `soundcloud.com/` is played in an `<iframe id="sc-widget">` using `https://w.soundcloud.com/player/`. The SC Widget JS API (`https://w.soundcloud.com/player/api.js`, loaded in `<head>`) wires `FINISH` → auto-advance, `PLAY`/`PAUSE` → UI sync. The `<audio>` element is hidden while SC is active and vice versa. Both modes auto-advance correctly in mixed playlists. Known issue: switching between SC and audio tracks can briefly overlap audio (the SC widget's async pause); not yet fixed.
- **YouTube support via the IFrame Player API.** `js/players/youtube.js` lazily creates a `YT.Player` inside `#yt-widget`; the SDK replaces `#yt-player` with an iframe. `pendingId` handles clicks before the SDK is ready and is cleared on stop. `PLAYING`/`PAUSED` update the app; `ENDED` advances/repeats saved queues and stops one-offs. Playlist and channel videos both use the shared popup; the legacy bottom-bar `#yt-toggle` is hidden inside the popup. Errors 101/150 identify creator-disabled embedding; other errors show a general unavailable message. Playlists auto-skip with the all-unplayable guard; channel one-offs retain identity for their explicit external link. `origin` is passed to the SDK. See the feature guides for host-switching details.

## Data model

Firestore collection `playlists`, one document per playlist:
```js
{ owner: "<uid>", name: "chill", tracks: [{ name, url }, …], updatedAt }
```
Tracks are an array inside the document. Optional `thumb` and `channelTitle`
are persisted when present; `duration` is not persisted by track autosave.
Imported YouTube documents also store `source: "youtube"`, `sourceUrl` and
`youtubePlaylistId`. These are normal playlists, not `kind: "youtube-channel"`
records, and must remain visible in `listPlaylists`. Their source metadata
does not prevent users from adding other source types.
All normal playlist documents may also have a numeric `position` saved by
sidebar reordering. Do not restore unconditional name sorting after creating
or loading playlists; use `comparePlaylists` so saved order survives imports
and sign-in. Library order writes must preserve tracks and source metadata.

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
- `player.js` exports `prev`, `getRepeat` that `app.js` does not currently call. `stop` is used during popup closure, playlist/Home navigation, edits that invalidate playback, and account changes.

## Documentation upkeep and verification

After changing behavior, update the related feature guide, root README,
architecture/UI references as applicable, and this file. Keep historical design
proposals identified as references rather than current application behavior.

The playlist guide records the latest 2026-11-28 local verification, including
sidebar mouse/touch/keyboard ordering, cancellation, rollback and persistence.
Browser checks use
auth/database/YouTube fixtures plus native-audio and SoundCloud event fixtures;
they do not validate a live API key, Firebase rules or provider playback.
Set `CHROME_PATH` to an existing Chromium executable. Optional
`YT_CHANNELS_SCREENSHOT` with `YT_PLAYLISTS_SCREENSHOT_VIEW=gallery` or `player`
captures the imported-list view after the shared browser suite completes.

## Firebase project

Project ID: `m3uplay-d9b1f`. `config.js` is **public by design** (no secrets). Firebase Storage, CORS, and IAM are **not used**.

The authoritative architecture doc is [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md). The trends reference is [`documents/TRENDS_BOARD.md`](documents/TRENDS_BOARD.md). Personal channel behavior, API-key setup, storage and verification are documented in [`js/yt-channels/README.md`](js/yt-channels/README.md). Imported playlist behavior, data fields, shared playback and verification are documented in [`js/yt-playlists/README.md`](js/yt-playlists/README.md).
