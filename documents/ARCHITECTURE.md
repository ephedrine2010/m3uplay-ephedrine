# M3U Player — Architecture & Reference

> **Last updated:** 2026-11-28
> **Audience:** developers and AI agents working on this codebase.
> **Goal of this doc:** let anyone (human or AI) understand the whole app quickly without re-reading every file or re-discovering past decisions.

---

## Personal YouTube channels (current home page)

**Current UI:** the owner-approved Apple treatment uses a desktop library
sidebar, a mobile drawer, neutral bordered cards and light/dark appearance.
`css/apple.css` loads after the base/feature styles; `js/ui.js` owns appearance
and drawer focus, while `js/icons.js` supplies outline icons. Playlist dialogs
are native `<dialog>` elements. See [APPLE_UI.md](APPLE_UI.md) for current
layout/interaction details; older shell descriptions below are historical.

The home page now places **personal YouTube channel rows above the trends** in
one `#discovery-home` scroll container. All feature modules, styles, setup docs
and standalone checks live in [`js/yt-channels/`](../js/yt-channels/README.md).
That reference is authoritative for the channel feature and its playback popup.

- Add by channel URL or `@handle`, preview the resolved channel, then save it.
- Up to 12 recent uploads per channel; click a thumbnail to play in a responsive
  native popup dialog. Close, Escape or backdrop click dismisses it and stops
  playback. Its transport state stays synchronized with the bottom bar.
- The menu offers Open on YouTube and confirmed Remove channel. Lists persist
  per account. A blocked embed offers an explicit link to the exact video.
- Channel headers support mouse/touch dragging, keyboard/menu movement and
  collapse. Account records persist `position` and `collapsed`; legacy records
  keep newest-added order until a custom order is saved. Batched position
  updates and individual collapse updates use the existing owner rules, with
  optimistic UI rollback on failure. The existing playlist ↑/↓ controls remain.
- Records use `playlists/{uid}_yt_{channelId}` with `owner`,
  `kind: "youtube-channel"`, `channelId`, `title`, `handle`, `thumb`, `uploadsId`,
  `url`, `addedAt`. Existing owner rules apply. Playlist queries exclude this
  kind; channel queries filter it after the owner query.
- Feeds use a separate website/API-restricted browser key stored as GitHub
  repository secret `YT_BROWSER_API_KEY`. The Pages workflow generates an
  artifact config via `js/yt-channels/prepare-pages.mjs`; tracked config stays
  empty. Choose GitHub Actions as the Pages source. Deezer/Apple trends need no
  API key; the legacy trends `YT_API_KEY` secret is no longer used.
- `app.js` owns channel state and request cancellation. The YouTube engine's
  `setHost` rebuilds the iframe SDK instance when switching host containers.
  One-off errors retain identity for the fallback; playlist errors still skip.
- **The YouTube trend row, Anghami and Spotify have been removed** from the current trends UI, snapshot
  and generator. Older investigation notes below describe historical decisions.

## YouTube playlist imports (current library)

The rail's **+** now offers **Create empty playlist**, **Add YouTube playlist**
and **Import M3U file**. YouTube import previews a public playlist link,
optionally renames the local copy and saves a normal owner-scoped playlist.
It uses the existing channel browser-key configuration and does not request
YouTube account access. Imported lists are editable snapshots; there is no
source sync or write-back.

`source: "youtube"` selects a responsive thumbnail grid. Manual and M3U lists
use rows with smaller thumbnails or a music placeholder. All lists retain
add/reorder/remove controls. Every YouTube item opens the existing player
dialog, including manually added items. Audio/SoundCloud entries in mixed
queues use their bottom players. The popup is mounted outside Home so hiding
the discovery view cannot hide playlist playback. Selecting another list or
Home stops playback, closes the popup and flushes pending playlist edits.

The shared API loads every 50-item page in playlist order and preserves
repeated entries. Invalid/private/deleted entries are skipped and reported;
empty, incomplete or oversized imports fail without partial saving. Imports
accept up to 500 source entries and 750,000 bytes of serialized track metadata.
Mixes, Watch later, history and private-account OAuth are not implemented.
See the [playlist feature guide](../js/yt-playlists/README.md) for the complete
flow, model, limits and verification.

## 1. What this app is

A small, single-page **web app to manage and play M3U music playlists**, built to run mainly on an **8-inch Android car screen** (also works on desktop/phone). Users sign in with Google, create playlists, add song URLs, and play them in a **built-in audio player**. Playlists live in **Firebase Firestore** (one document per playlist). It is installable as a **PWA** (home-screen icon, fullscreen).

- **Live URL (GitHub Pages):** `https://ephedrine2010.github.io/m3uplay-ephedrine/`
- **Repo:** `github.com/ephedrine2010/m3uplay-ephedrine` (branch `main`)
- **Firebase project:** `m3uplay-d9b1f`

No backend server. Everything is static files + Firebase (Auth + Firestore) called directly from the browser.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| UI | Vanilla HTML/CSS/JS — **no framework, no build step** |
| Modules | Native **ES modules** (`<script type="module">`), imported from `https://www.gstatic.com/firebasejs/10.12.2/...` |
| Auth | Firebase Authentication — **Google sign-in only** |
| Data | Firebase **Firestore** (`playlists` collection) |
| Playback | One queue (`player.js` coordinator) delegating to per-source engines in `js/players/`, picked per-URL: native `<audio>` · SoundCloud Widget iframe · YouTube IFrame API |
| Hosting | GitHub Pages (also runs from any static server / VS Code Live Server) |
| Install | PWA via `manifest.json` + `icon.svg` (**no service worker**) |

> ⚠️ **Must be served over http(s), not `file://`** — ES modules and the Google sign-in popup require it.

---

## 3. Layout (library, content and persistent player)

```
┌──────────────┬─ Playlist title    [Play all] [Add track] [Download] ───────┐  ← #topbar
├──────────────┬───────────────────────────────────────────────────────────┤
│ Playlists ＋ │  Thumbnail grid for imported YouTube playlists              │  #sidebar | #content
│  chill (act.)│  Artwork + editable rows for manual/M3U playlists            │
│  workout     │                                                            │
├──────────────┴───────────────────────────────────────────────────────────┤
│   ▮▯▮▮▯▮(eq)   Now Playing Name   [native audio: play/seek/volume]         │  ← #player-bar
└────────────────────────────────────────────────────────────────────────────┘
```

- **Left (`#sidebar`)** — brand, Home, playlist library with vertical drag grips and a **+** source menu; account/sign-out at the bottom. At ≤800 CSS px the library is a focus-contained drawer. Sidebar order is saved per account for all playlist types.
- **Right (`#content`)** — Home discovery or the selected list's `#playlist-info` and `#track-list`; `source: "youtube"` adds `.playlist-grid`.
- **Top (`#topbar`)** — Home or playlist title, the selected playlist's **Play all / Add track / Download** actions, appearance toggle and Home's Add channel control.
- **Bottom (`#player-bar`)** — decorative equalizer, now-playing text and active audio/SoundCloud controls, plus synchronized YouTube transport when relevant. **No prev/next controls** have been added.
- **YouTube popup (`.yc-player`)** — one native dialog under `document.body`, shared by channel and saved-playlist videos. Closing stops playback.

---

## 4. File map

```
index.html          # markup: sign-in screen, 3-pane shell, player bar, 3 modals
css/style.css       # base styling
css/apple.css       # current shell, themes, source menu, artwork rows and gallery
manifest.json       # PWA manifest (installable, standalone, landscape)
icon.svg            # app icon (music note)
js/
  config.js         # firebaseConfig (public). NOTE: appConfig.rootFolder is DEAD (Storage era)
  firebase.js       # initializes Firebase app ONCE, exports `app`
  auth.js           # Google sign-in (watchAuth / signIn / signOutUser)
  firestore.js      # playlist CRUD in Firestore
  playlist-order.js # saved sidebar positions and legacy alphabetical fallback
  yt-playlists/
    dialog.js       # YouTube playlist preview/name/import UI
    README.md       # playlist import, storage, playback and verification reference
  yt-channels/      # channels, shared YouTube API/player dialog, setup and tests
  m3u.js            # parseM3U / serializeM3U / nameFromUrl / extractUrl + YouTube URL helpers
  player.js         # playback COORDINATOR: owns the queue, routes per-URL to an engine
  players/          # one playback engine per source, all sharing the same interface
    audio.js        #   native <audio> element (catch-all)
    soundcloud.js   #   SoundCloud Widget iframe
    youtube.js      #   YouTube IFrame API player
  trends_board/     # "Trending in Egypt" discovery board (landing view in #content)
    index.js        #   public entry: initTrendsBoard({ mount, deps }) → { show, hide }
    data.js         #   loadTrending() → fetch data/trending.json; relTime()
    deezer.js       #   fetchPreview(deezerId) → fresh 30s preview URL via JSONP
    actions.js      #   hybrid click dispatch (preview / youtube / link)
    board.js band.js card.js tile.js image.js dom.js sources.js   # pure render + presentation
  app.js            # the controller: wires DOM <-> auth/firestore/player/m3u/trends_board
css/trends_board.css # all .tb-* board styles (reuses style.css tokens)
data/trending.json  # snapshot the board fetches (generated; committed)
scripts/fetch-trends.mjs      # Node snapshot fetcher (Deezer/Apple → trending.json)
.github/workflows/trends.yml  # daily cron + manual dispatch → runs fetcher, commits JSON
documents/
  ARCHITECTURE.md   # this file
  APPLE_UI.md       # current appearance and responsive interactions
  TRENDS_BOARD.md   # full reference for the discovery board
```

> The discovery board is documented in depth in [`TRENDS_BOARD.md`](TRENDS_BOARD.md); this file covers the core player/playlist app.

### Module responsibilities & exports

- **`firebase.js`** → `app`. Single `initializeApp(firebaseConfig)`; shared by `auth.js` and `firestore.js`.
- **`auth.js`** → `watchAuth(cb)`, `signIn()`, `signOutUser()`. Google popup sign-in. *(The file's top comment still mentions "Firebase Storage / folder" — that is **stale**; auth now only provides identity for Firestore.)*
- **`firestore.js`** → `listPlaylists(uid)`, `createPlaylist(uid, name, tracks=[], metadata={})`, `savePlaylistTracks(id, tracks)`, `savePlaylistOrder(playlists)`, `renamePlaylist(id, name)`, `deletePlaylist(id)`. Optional creation metadata adds YouTube source fields. Library ordering updates only positions in an atomic batch. `listPlaylists` queries the owner, excludes channel records by `kind` and sorts by saved position with alphabetical fallback (no composite index).
- **`playlist-order.js`** → `comparePlaylists` and `arrangePlaylists` preserve legacy alphabetical ordering, apply optional positions and reject incomplete/duplicate/foreign orders. `yt-channels/reorder.js:enableListReorder` supplies sidebar pointer/keyboard gestures; `enableChannelReorder` preserves the channel defaults.
- **`yt-playlists/dialog.js`** → `createPlaylistImportDialog({ mount, resolvePlaylist, onImport })`. Owns transient preview/name/save state and cancellation; returns `open()`/`close()`. Application state and persistence stay in `app.js`.
- **`yt-channels/api.js`** → shared `createYouTubeApi(config, fetcher)` exposes `resolveChannel`, `recentVideos`, `resolvePlaylist` and `clearCache`; input parsers validate supported channel and playlist URLs. Playlist imports retain source order/repeats rather than the channel feed's deduplication and newest-first order.
- **`m3u.js`** → `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, `extractUrl(text)`, `isYouTube(url)`, `youTubeId(url)`. Track object = `{ url, name, duration }` (duration `-1` = unknown). `serializeM3U` always writes **extended** M3U (`#EXTINF` with a name; default name derived from the URL filename — YouTube links fall back to `"YouTube video"`). `extractUrl` pulls the first `http(s)` link out of pasted text so a copied **share message** (a sentence wrapped around a URL) still adds cleanly.
- **`player.js`** (coordinator) → `initPlayer`, `setQueue`, `playAt`, `pause`, `resume`, `isPlaying`, `stop`, `next`, `prev`, `setRepeat`, `getRepeat`, `playingIndex`, `playOneOff`, `isOneOff`, `currentTrack` and `setYouTubeHost`. Owns the queue/current index, chooses the first matching engine (audio is the catch-all, kept last), stops/hides competing engines, advances/repeats saved queues and guards against all-unplayable loops. Engines report state through shared callbacks. One-offs replace the queue with one item and stop at the end; `currentTrack` backs the now-playing label. The `initPlayer` signature and host-selection ordering are described below.
- **`players/*.js`** — one **engine per source**, each exposing the identical interface: `init(el, callbacks)`, `matches(url)`, `play(url)`, `pause()`, `resume()`, `stop()`, `isPlaying()`, `setActive(on)`. They hold their own DOM/SDK state and never touch the queue. Engines:
  - **`audio.js`** — native `<audio>`. The catch-all (`matches()` always `true`). Auto-advances on the `ended` event.
  - **`soundcloud.js`** — SC Widget iframe; binds `FINISH` → `onEnded`, `PLAY`/`PAUSE` → `onPlay`/`onPause`.
  - **`youtube.js`** — YouTube IFrame API; player created lazily (`pendingId` covers a click before the API is ready). `ENDED` → `onEnded`; `onError` (embed-blocked 101/150, removed/private/region-locked 100/2/5) → `onError`.
- **`app.js`** — the application-state controller. Holds account/playlist state plus personal channels, feed results, loading/errors, `channelVideo`/`playlistVideo` and popup return index. Renders artwork rows or the imported-list grid and injects effects into feature views; engines retain SDK state and dialogs retain transient UI state.

`initPlayer` accepts `(audioEl, scIframe, ytWidget, onChange, notify,
onPlaybackError, beforePlay)`. `playAt` sets the index, invokes `beforePlay`,
then activates and loads the engine. The app's `prepareTrackPlayback` uses
that hook to choose the shared YouTube host before each load, including
auto-advance. Moving a live iframe recreates its SDK instance, so moving the
host after loading would discard playback. Consecutive YouTube videos in the
same dialog reuse their instance. `setYouTubeHost(host)` is also exported.

---

## 5. Data model (Firestore)

Collection **`playlists`**, one document per playlist:

```js
playlists/{autoId} = {
  owner: "<firebase uid>",        // who owns it (NOT email)
  name: "chill",                  // display name (also used as download filename)
  tracks: [                       // ordered array
    { name: "Song title", url: "https://…/song.mp3" },
    …
  ],
  updatedAt: <serverTimestamp>
}
```

- Tracks are stored as an **array inside the document** (simple; fine for normal playlist sizes — a Firestore doc max is 1 MB).
- Each user sees only their own playlists; isolation is by `owner == uid` in both the query and the security rules.
- Tracks require `name` and `url`; optional `thumb` and `channelTitle` survive selection, editing and saving. Track autosave drops `duration`; `serializeM3U` uses `-1` when no duration is present.
- YouTube imports add `source: "youtube"`, `sourceUrl` and `youtubePlaylistId` to the playlist document. These remain normal playlist records; only `kind: "youtube-channel"` is excluded from the rail. A source flag chooses the layout and does not restrict the sources of tracks added later.
- Normal playlist documents may have numeric `position` values saved by sidebar reordering. Positioned lists appear first; unpositioned/new lists follow alphabetically. Legacy libraries remain alphabetical until rearranged. Sidebar positions are independent of channel positions and track order, and are covered by the same owner rules.
- M3U download serializes the track names/URLs and any available duration. It does not export playlist source metadata, thumbnails or creator labels.

### Firestore Security Rules (set in Firebase console)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /playlists/{id} {
      allow read:           if request.auth != null && resource.data.owner == request.auth.uid;
      allow create:         if request.auth != null && request.resource.data.owner == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.owner == request.auth.uid;
    }
  }
}
```

---

## 6. Key data flows

- **Sign in:** `watchAuth` callback fires → store `uid`, show `#app`, `loadPlaylists()`.
- **Load playlists:** `listPlaylists(uid)` → `state.playlists` → `renderPlaylists()`.
- **Select playlist:** flush pending edits, close the shared popup and stop playback; copy tracks with optional artwork/creator metadata into `state.tracks`, retain the playlist's `source`, set the queue and render the grid/rows and toolbar.
- **Play:** tap a track (`toggleTrack`) or **Play all** → `playAt(i)` invokes `prepareTrackPlayback` before engine activation/loading. Every YouTube item uses the shared popup; audio/SoundCloud items use the bottom bar. `reflectPlayState` synchronizes the selected item, popup/bottom transports, equalizer, Play-all label and now-playing text. Mixed queues change presentation automatically as they advance.
- **Add song:** **＋ Add** opens `#add-song-modal`; `addCurrentSong()` pushes `{name,url}` to `state.tracks`, keeps the popup open (clears fields) for rapid entry, then `scheduleSave()`.
- **Auto-save:** edits update the local cached tracks and call `scheduleSave()` → debounced ~1s → `persist(false)`. Cleaned tracks preserve optional artwork/creator fields. Navigation flushes a pending write, capturing the original playlist ID, UID and track snapshot before awaiting Firestore. Saving does not re-render. Account changes cancel timers and clear the old library. There is **no manual Save button**.
- **M3U import:** **Playlists → + → Import M3U file** → picker → `parseM3U` → `createPlaylist` using the filename → select the editable row view.
- **Reorder the library:** drag any sidebar grip or focus it and press ↑/↓ → validate the complete playlist ID list → optimistic positions → atomic `savePlaylistOrder`. Mouse/touch dragging saves on drop only, with edge scrolling and cancellation. Failed writes restore positions while retaining current track metadata. Session guards prevent late results from changing another account's library. Selection and playback remain active.
- **YouTube import:** **Playlists → + → Add YouTube playlist** → preview with full pagination → optional name → `createPlaylist` with tracks/source metadata → add the saved result to the local sorted library and select its gallery. Failures remain retryable; account guards prevent late completion from changing another user's library.
- **Download:** `serializeM3U(state.tracks)` → Blob (`audio/x-mpegurl`) → triggers a `<name>.m3u` download.
- **Delete (song or playlist):** opens the **reusable confirm popup** (`askConfirm` returns a `Promise<boolean>`) before removing — guards against accidental taps on the touch screen.

---

## 7. Behaviors & deliberate decisions

- **Repeat is always ON** for saved queues (`setRepeat(true)` at startup, no toggle UI). Channel/trend one-offs stop at the end. Playback errors auto-skip; an all-unplayable queue stops.
- **Track names and URLs are read-only** — rows/cards show artwork, the title and creator/source; the URL is a hover tooltip. To change a name or URL, delete and re-add the track. Add/reorder/remove remain available.
- **Tap a track** toggles play/pause if it's the current one, otherwise plays it.
- **The equalizer (`#viz`) is decorative** — 8 CSS-animated bars driven only by the audio `play`/`pause` state. It is **NOT** a real audio analyser. (See §8 for why.)
- **Confirm popup before any delete.**
- **Current responsive UI** — `css/apple.css` supplies light/dark appearance, touch controls, a compact library drawer and adaptive gallery/row layouts. See [APPLE_UI.md](APPLE_UI.md).

---

## 8. Important history — read before changing storage/playback

This app went through several storage designs. **Do not re-attempt the abandoned ones**; they were ruled out for concrete reasons:

1. **GitHub repo as storage (client-side token)** — rejected. A GitHub token in a public repo gets **auto-revoked by secret scanning**, and the repo must be public for raw URLs to be playable. Dead end.
2. **Firebase Storage (.m3u files)** — worked, but required CORS config + making objects public (IAM) just so the in-browser editor and players could read files. Heavy setup, ugly URLs.
3. **The real blocker that killed "share a playlist URL":** desktop music players (tested with **AIMP**, also VLC) **do not expand a *remote* `.m3u` URL** into multiple items — they treat the URL as a single stream. Only a **local `.m3u` file** expands. This is a player behavior, not fixable by any storage backend.
4. **Current design (chosen):** store structured data in **Firestore** and **play in a built-in player**. This sidesteps CORS/IAM/tokens entirely and solves playback at the root. The **Download** button still produces a real local `.m3u` for use elsewhere.

> Takeaway for future agents: the built-in player + Firestore is the answer. "Just host the .m3u somewhere" does **not** give a multi-track experience in external players.

### Playback source integrations (what's in, what's ruled out)

The player is engine-based (`js/players/`) so adding a source is "write one engine implementing the shared interface and register it in `player.js`". Sources evaluated so far:

| Source | Status | Notes |
|---|---|---|
| Direct audio URL | ✅ in (`audio.js`) | native `<audio>`; the catch-all engine. |
| SoundCloud | ✅ in (`soundcloud.js`) | SC Widget iframe — **no API key needed**. The SC **API v1/v2** is *not* used: no new keys are issued and stream URLs require SoundCloud Go+. |
| YouTube | ✅ in (`youtube.js`) | IFrame Player API (with video). **No audio-only / no forcing embed-blocked videos**: there's no legitimate raw-stream URL, and an owner who disables embedding can't be overridden client-side (we toast + auto-skip; the block also can't be detected before play time). |
| Anghami | ❌ ruled out | **Every** endpoint blocks third-party framing server-side: `open.anghami.com/<code>` → `CSP: frame-ancestors 'self'`; `play.anghami.com/song/<id>` → `X-Frame-Options: DENY`; even Anghami's own `www.anghami.com/embed/song/<id>` → `X-Frame-Options: SAMEORIGIN` (anghami.com only). No iframe URL will render off-site, and there's no JS API or stream URL. An iframe engine was built then removed once these headers were confirmed. |
| Spotify | ❌ ruled out | iFrame Embed API is technically a good fit (real play/pause/seek + `playback_update`), **but** plays **30-second previews only** unless the listener is signed into Spotify **Premium in that browser**. Full tracks need the Web Playback SDK (OAuth + Premium) — too heavy for a preview-only payoff. |

---

## 9. External setup (Firebase console — project `m3uplay-d9b1f`)

1. **Authentication → Sign-in method →** enable **Google**.
2. **Authentication → Settings → Authorized domains →** add every host you serve from (e.g. `localhost`, `127.0.0.1`, `ephedrine2010.github.io`). *Note: `localhost` and `127.0.0.1` are treated as different domains.*
3. **Firestore →** create the database and publish the rules from §5.
4. Firebase **Storage / CORS / IAM are NOT used anymore** — ignore any older docs/READMEs mentioning `gsutil cors` or `allUsers:objectViewer`.

`config.js`'s `firebaseConfig` is **public by design**. Channel metadata and
playlist imports use a separate restricted browser key, supplied as GitHub
repository secret `YT_BROWSER_API_KEY` and injected into the deployment
artifact. The served key is visible to visitors; keep tracked source empty
and follow the [YouTube setup guide](../js/yt-channels/README.md#one-time-setup).

---

## 10. PWA / installation

- `manifest.json`: `display: standalone`, `orientation: landscape`, dark theme, `icon.svg`.
- **No service worker** — deliberate. It means **the app always loads the latest version from the server** (no stale-cache problem). Trade-off: it needs a network connection to launch (fine — it talks to Firebase anyway).
- **Install on the car:** open the URL in the car's Chrome → menu → **Add to Home screen**. Works on **full-Android head units** (own browser/home screen). **Android Auto** (phone-projected) cannot install web apps.
- New commits to `main` → GitHub Pages rebuilds → next launch shows the update (minus brief HTTP caching). The home-screen **icon/name** are captured at install time; changing them needs a re-add.

---

## 11. Known gotchas / tech debt

- **Stale comment:** `auth.js` header still references "Firebase Storage / folder" — outdated, only does Google sign-in now.
- **Dead config:** `config.js` still has `appConfig.rootFolder = "playlists"` from the Storage era — unused.
- **Unused exports:** `player.js` exports `prev` and `getRepeat` that `app.js` doesn't currently call. `stop` is used for navigation, popup closure, account changes and edits that invalidate playback.
- **Playlist tracks use ↑/↓ buttons** — native drag is unreliable on touch. Personal channel rows use Pointer Events for mouse/touch dragging.
- **Editing a track name** isn't possible in-place (rows are read-only) — delete + re-add.
- Keep this architecture reference, the root README, feature guides and `CLAUDE.md` aligned when behavior changes.

---

## 12. Common tasks (how to extend)

- **Add a player feature (e.g., shuffle):** add state/logic in `player.js` (the coordinator), expose an export, wire a control in `index.html` + `app.js`.
- **Add a new playback source (e.g., Bandcamp):** create `js/players/<source>.js` implementing the shared engine interface (`init`/`matches`/`play`/`pause`/`resume`/`stop`/`isPlaying`/`setActive`), add its DOM element to the player bar in `index.html`, then import + register it in `player.js`'s `engines` array (**before** `audio`, the catch-all). No other file changes needed. See §8 for sources already ruled out.
- **Add a field to playlists (e.g., cover art):** extend the Firestore doc shape in `firestore.js` writes, render it in `app.js`.
- **Playlist track dragging, if requested:** adapt the channel rows' Pointer Events approach; avoid native HTML5 DnD on touch.
- **Change styling/density:** current overrides live in `css/apple.css`, loaded after `css/style.css` and feature styles. Gallery selectors use `#track-list.playlist-grid`; manual rows use `#track-list:not(.playlist-grid)`. Keep both layouts usable on compact screens.

---

## 13. Element ID quick-reference (for `app.js` wiring)

| ID | Purpose |
|---|---|
| `#signin-box` / `#signin-btn` | sign-in screen / Google button |
| `#app` | main app container (hidden until signed in) |
| `#play-all-btn` | Play all / Pause / Continue toggle (topbar) |
| `#add-song-btn` / `#download-btn` | open Add-song popup / download current playlist |
| `#user-email` / `#signout-btn` | account info / sign out |
| `#sidebar` / `#playlist-list` | left pane / playlist `<ul>` with `.pl-drag-handle` controls and `data-playlist-id` rows |
| `#new-pl-btn` / `#playlist-add-menu` | library source-menu trigger / source choices |
| `#new-empty-pl-btn` / `#add-yt-playlist-btn` | create empty list / open YouTube import dialog |
| `#import-btn` / `#import-file` | M3U source-menu action / hidden file input |
| `#yt-playlist-dialog` / `#yt-playlist-url` / `#yt-playlist-name` | import popup / source URL / local playlist name |
| `#playlist-info` | track count and imported-copy description |
| `#content` / `#track-list` | right pane / tracks `<ul>` |
| `#player-bar` / `#viz` / `#now-playing` / `#audio` | player bar / equalizer / label / `<audio>` |
| `#sc-widget` | SoundCloud Widget iframe (shown only for SC tracks) |
| `#yt-widget` (`#yt-player`, `#yt-toggle`) | shared YouTube wrapper / SDK target / legacy bottom toggle hidden in popup |
| `#new-pl-modal` (`#new-name`,`#new-pl-create`,`#new-pl-cancel`) | create-playlist popup |
| `#add-song-modal` (`#add-url`,`#add-name`,`#add-track-btn`,`#add-song-done`) | add-song popup |
| `#confirm-modal` (`#confirm-text`,`#confirm-ok`,`#confirm-cancel`) | reusable confirm popup |
| `#status` | transient toast (auto-clears after 3.5s) |

---

## 14. Verification

Run `node --test js/yt-channels/tests/*.test.mjs`, then the shared browser suite
with `node js/yt-channels/tests/browser.mjs`. Set `CHROME_PATH` to an existing
Chromium executable and use `YT_CHANNELS_WINDOW_SIZE=390,844` for phone layout.
The [playlist guide](../js/yt-playlists/README.md#verification) documents coverage,
screenshot options and the latest 2026-11-28 local results, including sidebar
ordering and pending-save account isolation. Auth, database transport, YouTube
services and audio/SoundCloud events are fixtures; production API restrictions,
Firebase rules and real provider playback require a configured browser test.

*End of document. If you change behavior, update this file and bump the "Last updated" date at the top.*
