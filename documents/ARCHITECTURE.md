# M3U Player — Architecture & Reference

> **Last updated:** 2026-06-19
> **Audience:** developers and AI agents working on this codebase.
> **Goal of this doc:** let anyone (human or AI) understand the whole app quickly without re-reading every file or re-discovering past decisions.

---

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
| Playback | One queue (`player.js` coordinator) delegating to per-source engines in `js/players/`, picked per-URL: native `<audio>` · SoundCloud Widget iframe · YouTube IFrame API · Anghami embed iframe |
| Hosting | GitHub Pages (also runs from any static server / VS Code Live Server) |
| Install | PWA via `manifest.json` + `icon.svg` (**no service worker**) |

> ⚠️ **Must be served over http(s), not `file://`** — ES modules and the Google sign-in popup require it.

---

## 3. Layout (the 3-pane shell)

```
┌─ 🎵 M3U Player   [▶ Play all] [＋ Add] [⬇ Download]      email · Sign out ─┐  ← #topbar
├──────────────┬───────────────────────────────────────────────────────────┤
│ Playlists ＋⬆ │  ▶ Track name                                  ↑ ↓ ✕        │  #sidebar | #content
│  chill (act.)│  ▶ Track name                                  ↑ ↓ ✕        │
│  workout     │                                                            │
├──────────────┴───────────────────────────────────────────────────────────┤
│   ▮▯▮▮▯▮(eq)   Now Playing Name   [native audio: play/seek/volume]         │  ← #player-bar
└────────────────────────────────────────────────────────────────────────────┘
```

- **Left (`#sidebar`)** — playlist library + header actions: **＋** (new playlist popup) and **⬆** (import .m3u).
- **Right (`#content`)** — the selected playlist's tracks (`#track-list`). No title bar (the active playlist is highlighted in the sidebar instead).
- **Top (`#topbar`)** — brand (left), centered action group **Play all / Add / Download** (only shown when a playlist is selected), user email + Sign out (right).
- **Bottom (`#player-bar`)** — decorative equalizer, "now playing" text, and the native `<audio>` element. **No prev/next buttons** (auto-advance handles track changes).

---

## 4. File map

```
index.html          # markup: sign-in screen, 3-pane shell, player bar, 3 modals
css/style.css       # all styling (dark theme, compact rows tuned for 8" screen)
manifest.json       # PWA manifest (installable, standalone, landscape)
icon.svg            # app icon (music note)
js/
  config.js         # firebaseConfig (public). NOTE: appConfig.rootFolder is DEAD (Storage era)
  firebase.js       # initializes Firebase app ONCE, exports `app`
  auth.js           # Google sign-in (watchAuth / signIn / signOutUser)
  firestore.js      # playlist CRUD in Firestore
  m3u.js            # parseM3U / serializeM3U / nameFromUrl + URL helpers (YouTube, Anghami)
  player.js         # playback COORDINATOR: owns the queue, routes per-URL to an engine
  players/          # one playback engine per source, all sharing the same interface
    audio.js        #   native <audio> element (catch-all)
    soundcloud.js   #   SoundCloud Widget iframe
    youtube.js      #   YouTube IFrame API player
    anghami.js      #   Anghami embed iframe (no JS API)
  app.js            # the controller: wires DOM <-> auth/firestore/player/m3u
documents/
  ARCHITECTURE.md   # this file
```

### Module responsibilities & exports

- **`firebase.js`** → `app`. Single `initializeApp(firebaseConfig)`; shared by `auth.js` and `firestore.js`.
- **`auth.js`** → `watchAuth(cb)`, `signIn()`, `signOutUser()`. Google popup sign-in. *(The file's top comment still mentions "Firebase Storage / folder" — that is **stale**; auth now only provides identity for Firestore.)*
- **`firestore.js`** → `listPlaylists(uid)`, `createPlaylist(uid, name, tracks=[])`, `savePlaylistTracks(id, tracks)`, `renamePlaylist(id, name)`, `deletePlaylist(id)`. `listPlaylists` queries `where("owner","==",uid)` and sorts by name client-side (avoids needing a composite index).
- **`m3u.js`** → `parseM3U(text)`, `serializeM3U(tracks)`, `nameFromUrl(url)`, `isYouTube(url)`, `youTubeId(url)`, `isAnghami(url)`, `anghamiEmbedUrl(url)`. Track object = `{ url, name, duration }` (duration `-1` = unknown). `serializeM3U` always writes **extended** M3U (`#EXTINF` with a name; default name derived from the URL filename — YouTube links fall back to `"YouTube video"`, Anghami links to `"Anghami track"`).
- **`player.js`** (coordinator) → `initPlayer(audioEl, scIframe, ytWidget, anghIframe, onChange, notify)`, `setQueue(tracks)`, `playAt(i)`, `pause()`, `resume()`, `isPlaying()`, `stop()`, `next()`, `prev()`, `setRepeat(on)`, `getRepeat()`, `playingIndex()`. Owns the **queue + current index** but does no playback itself: it holds an ordered list of **engines** (`js/players/*.js`) and routes each URL to the first engine whose `matches(url)` returns true (`audio` is the catch-all, kept **last**). `_activate(engine)` makes one engine the only audible/visible one — it calls `stop()` + `setActive(false)` on every other engine so they never overlap. Engines report back through a shared `callbacks` object — `onPlay`/`onPause` (UI sync), `onEnded` (auto-advance via `next()`), `onError` (toast + auto-skip, guarded by `errorSkips` so an all-unplayable queue stops instead of looping). *(`stop`, `prev`, `getRepeat` are exported but currently unused by `app.js`.)*
- **`players/*.js`** — one **engine per source**, each exposing the identical interface: `init(el, callbacks)`, `matches(url)`, `play(url)`, `pause()`, `resume()`, `stop()`, `isPlaying()`, `setActive(on)`. They hold their own DOM/SDK state and never touch the queue. Engines:
  - **`audio.js`** — native `<audio>`. The catch-all (`matches()` always `true`). Auto-advances on the `ended` event.
  - **`soundcloud.js`** — SC Widget iframe; binds `FINISH` → `onEnded`, `PLAY`/`PAUSE` → `onPlay`/`onPause`.
  - **`youtube.js`** — YouTube IFrame API; player created lazily (`pendingId` covers a click before the API is ready). `ENDED` → `onEnded`; `onError` (embed-blocked 101/150, removed/private/region-locked 100/2/5) → `onError`.
  - **`anghami.js`** — plain Anghami embed iframe with **no JS API**: user controls it inside the frame, `isPlaying()` is always `false`, no auto-advance, and `stop()` unloads the iframe (`src="about:blank"`) since that's the only way to silence it. `resume()` reloads the last URL fresh.
- **`app.js`** — the only stateful controller. Holds `state = { uid, playlists[], current, tracks[] }` and wires every DOM event to the modules.

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
- `duration` is not persisted (only `name` + `url`); `serializeM3U` defaults duration to `-1` on export.

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
- **Select playlist:** copy its `tracks` into `state.tracks`, `setQueue`, show topbar actions, `renderTracks()`.
- **Play:** tap a track (`toggleTrack`) or **Play all** → `playAt(i)` picks the engine whose `matches(url)` wins (audio / SoundCloud / YouTube / Anghami), `_activate()`s it (stopping + hiding the rest), and plays. Each engine reports back through the `onChange` callback (`reflectPlayState`), and the `<audio>` element's `play/pause/ended` events also fire it; it updates the equalizer, the Play-all button label, the row icons, and "now playing". A YouTube track shows a small video thumbnail in the player bar that **`#yt-toggle`** collapses to audio-only. An **Anghami** track is played/paused by the user inside its own iframe — the transport bar can't drive it, and the queue won't auto-advance off it (no JS API).
- **Add song:** **＋ Add** opens `#add-song-modal`; `addCurrentSong()` pushes `{name,url}` to `state.tracks`, keeps the popup open (clears fields) for rapid entry, then `scheduleSave()`.
- **Auto-save:** any edit (add/delete/reorder) calls `scheduleSave()` → debounced ~1s → `persist(false)` writes `cleanTracks()` to Firestore. Does **not** re-render (won't disrupt focus). There is **no manual Save button** anymore.
- **Import:** **⬆** → file picker → `parseM3U` → `createPlaylist(uid, name, tracks)` (name from filename) → select it.
- **Download:** `serializeM3U(state.tracks)` → Blob (`audio/x-mpegurl`) → triggers a `<name>.m3u` download.
- **Delete (song or playlist):** opens the **reusable confirm popup** (`askConfirm` returns a `Promise<boolean>`) before removing — guards against accidental taps on the touch screen.

---

## 7. Behaviors & deliberate decisions

- **Repeat is always ON** (`setRepeat(true)` at startup, no toggle UI). The playlist loops endlessly.
- **Track rows are read-only** — they show the **name only** (URL hidden, kept in data; visible as a hover tooltip). To change a track, delete and re-add it.
- **Tap a track** toggles play/pause if it's the current one, otherwise plays it.
- **The equalizer (`#viz`) is decorative** — 8 CSS-animated bars driven only by the audio `play`/`pause` state. It is **NOT** a real audio analyser. (See §8 for why.)
- **Confirm popup before any delete.**
- **Compact UI** — paddings/heights/fonts are intentionally small to fit the 8" car screen. `#app` has `padding-bottom: 28px` to lift the player bar off the screen edge.

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
| Anghami | ✅ in (`anghami.js`), limited | Plain embed iframe with **no JS control API** — user-driven, no auto-advance, `isPlaying()` always false, preview-only unless signed into Anghami Plus in the same browser. Kept anyway because it still plays. |
| Spotify | ❌ ruled out | iFrame Embed API is technically a good fit (real play/pause/seek + `playback_update`), **but** plays **30-second previews only** unless the listener is signed into Spotify **Premium in that browser**. Full tracks need the Web Playback SDK (OAuth + Premium) — too heavy for a preview-only payoff. |

---

## 9. External setup (Firebase console — project `m3uplay-d9b1f`)

1. **Authentication → Sign-in method →** enable **Google**.
2. **Authentication → Settings → Authorized domains →** add every host you serve from (e.g. `localhost`, `127.0.0.1`, `ephedrine2010.github.io`). *Note: `localhost` and `127.0.0.1` are treated as different domains.*
3. **Firestore →** create the database and publish the rules from §5.
4. Firebase **Storage / CORS / IAM are NOT used anymore** — ignore any older docs/READMEs mentioning `gsutil cors` or `allUsers:objectViewer`.

`config.js`'s `firebaseConfig` is **public by design** (safe to commit). There is **no secret token anywhere** in this app.

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
- **Unused exports:** `player.js` exports `stop`, `prev`, `getRepeat` that `app.js` doesn't currently call.
- **No reorder on touch via drag** — uses ↑/↓ buttons (deliberate: native drag is unreliable on touch).
- **Editing a track name** isn't possible in-place (rows are read-only) — delete + re-add.
- A stale `README.md` from the Firebase-Storage era may still exist at repo root; **this `documents/ARCHITECTURE.md` is the source of truth.**

---

## 12. Common tasks (how to extend)

- **Add a player feature (e.g., shuffle):** add state/logic in `player.js` (the coordinator), expose an export, wire a control in `index.html` + `app.js`.
- **Add a new playback source (e.g., Bandcamp):** create `js/players/<source>.js` implementing the shared engine interface (`init`/`matches`/`play`/`pause`/`resume`/`stop`/`isPlaying`/`setActive`), add its DOM element to the player bar in `index.html`, then import + register it in `player.js`'s `engines` array (**before** `audio`, the catch-all). No other file changes needed. See §8 for sources already ruled out.
- **Add a field to playlists (e.g., cover art):** extend the Firestore doc shape in `firestore.js` writes, render it in `app.js`.
- **Re-enable manual reorder by drag:** implement pointer-event based reordering (avoid native HTML5 DnD on touch).
- **Change styling/density:** everything is in `css/style.css`; row sizes live under `#playlist-list li`, `#track-list li`, `.t-play`, `.t-btn`, `.del`.

---

## 13. Element ID quick-reference (for `app.js` wiring)

| ID | Purpose |
|---|---|
| `#signin-box` / `#signin-btn` | sign-in screen / Google button |
| `#app` | main app container (hidden until signed in) |
| `#play-all-btn` | Play all / Stop / Continue toggle (topbar) |
| `#add-song-btn` / `#download-btn` | open Add-song popup / download current playlist |
| `#user-email` / `#signout-btn` | account info / sign out |
| `#sidebar` / `#playlist-list` | left pane / playlist `<ul>` |
| `#new-pl-btn` / `#import-btn` / `#import-file` | new-playlist popup / import / hidden file input |
| `#content` / `#track-list` | right pane / tracks `<ul>` |
| `#player-bar` / `#viz` / `#now-playing` / `#audio` | player bar / equalizer / label / `<audio>` |
| `#sc-widget` | SoundCloud Widget iframe (shown only for SC tracks) |
| `#yt-widget` (`#yt-player`, `#yt-toggle`) | YouTube player wrapper / IFrame-API target div / collapse-to-audio toggle |
| `#angh-widget` | Anghami embed iframe (shown only for Anghami tracks; user-controlled) |
| `#new-pl-modal` (`#new-name`,`#new-pl-create`,`#new-pl-cancel`) | create-playlist popup |
| `#add-song-modal` (`#add-url`,`#add-name`,`#add-track-btn`,`#add-song-done`) | add-song popup |
| `#confirm-modal` (`#confirm-text`,`#confirm-ok`,`#confirm-cancel`) | reusable confirm popup |
| `#status` | transient toast (auto-clears after 3.5s) |

---

*End of document. If you change behavior, update this file and bump the "Last updated" date at the top.*
