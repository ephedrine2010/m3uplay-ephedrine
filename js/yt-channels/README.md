# Personal YouTube channels

The home page displays each signed-in user's chosen YouTube channels **above**
the Deezer and Apple Music trends. The YouTube trend row, Anghami and Spotify
were removed from the snapshot, its generator and the renderer. Personal
YouTube channels and their playback remain available above the trends.

The rail also supports **editable YouTube playlist imports**. That flow uses
this feature's API client, browser-key configuration, tests and shared video
popup; its dialog and guide live in
[`js/yt-playlists/`](../yt-playlists/README.md). Imported playlists use the
normal library and do not become channel rows.

## One-time setup

1. In Google Cloud Console, enable **YouTube Data API v3** and create a dedicated
   **browser API key**.
2. Restrict its application usage to **Websites (HTTP referrers)**. For the
   current GitHub Pages deployment allow `https://ephedrine2010.github.io/*`.
   Browsers usually send only the origin on cross-origin API requests, so a
   restriction to the repository's URL path can reject valid requests. Add
   `http://localhost:8000/*` and `http://127.0.0.1:8000/*` for local development.
3. Restrict its API access to **YouTube Data API v3 only**.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions**
   and add a repository secret named **`YT_BROWSER_API_KEY`** containing that key.
5. Push the feature and deployment files to **`main`**. Leave `apiKey: ""` in
   the tracked [config.js](config.js).
6. Open **Settings → Pages → Build and deployment → Source** and select
   **GitHub Actions**. Branch publishing cannot inject repository secrets.
7. Open **Actions → Deploy M3U Player → Run workflow**, select `main`, and run
   it. Subsequent pushes to `main` deploy automatically. Adding or rotating a
   secret alone does not trigger deployment; run the workflow again afterward.

The connection is:

```text
GitHub secret YT_BROWSER_API_KEY
  → pages.yml passes it as an environment variable
  → prepare-pages.mjs creates _site/js/yt-channels/config.js
  → GitHub Pages serves that generated file
  → the existing browser imports read the configured key
```

Only the deployment artifact contains the key; packaging does not overwrite
tracked source and never prints the value. `_site/` is ignored by Git. The
workflow fails with a clear setup message when the secret is missing, rather
than publishing an unconfigured site. It publishes runtime HTML/CSS/JS, the
manifest/icon, and the trends snapshot; repository internals, tests, docs and
deployment scripts are excluded. An existing `CNAME` is preserved if present.

The daily **Refresh Egypt trends** workflow also triggers deployment after
success on this repository's `main`. This is necessary because its automated
`GITHUB_TOKEN` commit does not start ordinary push workflows. The Pages workflow
checks out current `main`, including the new snapshot, and does not consume
artifacts or code from a fork or a pull request.

This is a browser credential and is visible to visitors. Its website/API
restrictions are required. Use a **separate key** from the Firebase config and
any server credentials. The legacy trends secret `YT_API_KEY` is no longer used.
Server secrets must never be copied into the browser configuration. A public-data API key does not require another
YouTube sign-in or access to a user's YouTube account.

There is no app compilation, proxy or new backend. Packaging runs only during
deployment. GitHub secrets are not available to a local static server. With
the local config empty, saved channels remain removable and a setup message is
shown; existing saved playlists and individual-video playback continue working.
Channel lookup/feeds and YouTube playlist import become available once the
restricted key is configured. Do not ask end users to supply credentials in
either the channel or playlist-import dialog.

For a local configured preview, supply `YT_BROWSER_API_KEY` in your local
environment and run `node js/yt-channels/prepare-pages.mjs`. Serve the generated
`_site` directory over HTTP on an allowed localhost origin. Use a new or empty
output directory (the command accepts one as its first argument); it deliberately
does not erase or overwrite existing output. Keep credentials out of tracked
source, command arguments and shell history.

### Troubleshooting channel lookup

All channel lookups require the browser key above, including valid handles such
as `https://www.youtube.com/@SharkTankEgypt` and `https://www.youtube.com/@NagdyWP`.
Changing a handle to a channel ID does not bypass this requirement.

| Message | What the app owner should check |
| --- | --- |
| "lookup has not been set up" | The served config has an empty key. For Pages, verify the repository secret name, choose GitHub Actions as the publishing source and run Deploy M3U Player. A local server does not receive GitHub secrets. |
| "invalid or expired API key" | Replace the configured browser key with a valid dedicated key. |
| "not authorized for this website address" | Add the actual hosting origin/local development address to the key's website restrictions. |
| "API access is not enabled or allowed" | Enable YouTube Data API v3 in the key's project and allow it in the key's API restrictions. |
| "Channel not found" | A successful lookup returned no channel; check the handle. |

The old message "Channel videos are temporarily unavailable. Please try again
later." was also returned for an empty key. That condition is permanent until
setup is completed, so it now explicitly identifies the missing setup. The
end-user dialog never asks for credentials or prints raw provider errors/keys.
When checking a deployed copy, verify the deployment succeeded and reload;
editing only a local file or adding a secret does not update the hosted config.

## User flow

- The **＋ icon** (tooltip/accessible label: **Add YouTube channel**) opens a
  native modal dialog from the Home toolbar. The section has no visible title,
  description or drag instruction banner. Refresh is an outline icon on
  desktop and a menu action on all widths; see
  [the UI reference](../../documents/APPLE_UI.md). Paste an `@handle`, a
  `youtube.com/@handle` URL, a `/channel/UC…` URL, or an older `/user/name` URL.
  Bare channel IDs are also accepted. Channel tab suffixes such as `/videos`
  work. Custom `/c/name` links and video links produce a helpful validation
  message; use the channel's current handle instead.
- **Find channel** displays its picture, name and handle. **Add channel** saves
  it to the account and puts its row first. Duplicate IDs are rejected even
  when different URL forms resolve to the same channel.
- Each row contains up to **12 public uploads**, sorted by publication time,
  with thumbnails, titles and dates. Shorts and published livestream recordings
  may appear because they belong to the uploads feed. This is not limited to
  music. Unavailable/deleted/private feed entries are omitted.
- **Refresh** reloads that row. Opening the page again loads the current feed;
  repeat requests in the same session are cached for 10 minutes. Cache content
  is memory-only and cleared at sign-out.
- Drag the **⠿ handle** up or down to reorder channel rows with a mouse or
  touch. The row header follows the pointer, and dragging near the pane's top
  or bottom scrolls the list. Drop to save; Escape or a cancelled gesture
  restores the previous order. Video rails retain their horizontal panning.
  Keyboard users can focus the handle and use **↑/↓**; the **⋯** menu also
  provides **Move up / Move down**, disabled at the corresponding list edge.
- Use **▾ / ▸** to collapse or expand a row's videos. The channel header stays
  visible; the button exposes its expanded state to assistive technology.
  Both custom order and collapsed state are saved per account and restored
  after reload/sign-in. These preferences do not change the playback queue.
- Click a thumbnail to open **one responsive 16:9 video player in a popup dialog
  on the same page**. Its controls and the bottom Play/Pause button
  stay synchronized; the selected card shows Playing or Paused. Playback stops
  at the end rather than repeating.
- **×**, **Escape**, or clicking the backdrop closes the popup and stops
  playback. Close it to choose another thumbnail. The popup traps focus and
  restores it to the triggering thumbnail when dismissed. Opening a playlist
  or starting a trend closes the popup and returns the shared engine to the bar.
- If embedding is blocked, the panel explains why and displays **Watch on
  YouTube ↗** for that exact video. Other playback errors show a general
  unavailable message with the same option. There is no automatic redirect.
- The channel's **⋯** menu offers **Open on YouTube**, **Move up**, **Move down**
  and **Remove channel**.
  Removal requires the app's existing confirmation popup and is saved only
  after the database delete succeeds. Removing the playing channel stops it.

The same video popup serves YouTube items from saved playlists, including
manual and M3U lists. Saved queues advance/repeat and auto-skip unavailable
videos; channel videos retain the one-off behaviour above. The popup is
mounted under `document.body`, outside `#discovery-home`, so it remains visible
when a playlist replaces Home. See the
[playlist playback reference](../yt-playlists/README.md#layout-and-playback).

## Files and ownership

| File | Responsibility |
| --- | --- |
| `config.js` | Empty key placeholder, 12-video limit, session cache lifetime |
| `prepare-pages.mjs` | Generate the deployment artifact from `YT_BROWSER_API_KEY` without changing source |
| `api.js` | Channel/playlist input validation, channel lookup/feed cache, complete playlist imports and shared request errors/timeouts |
| `storage.js` | Owner-scoped Firestore CRUD for saved channels |
| `preferences.js` | Legacy-compatible sorting and validated immutable reordering |
| `reorder.js` | Shared list gestures: `enableChannelReorder` retains channel defaults; `enableListReorder` also supports sidebar playlists |
| `view.js` | Channel identities, cards, dates, row menus and rails |
| `dialog.js` | Accessible add-channel dialog, lookup cancellation, preview and save UI |
| `index.js` | View assembly, stable channel-row DOM, body-mounted shared player popup and fallback presentation |
| `style.css` | Feature styles and the shared discovery scroll container |
| `tests/*.mjs` | Standalone Node/API and browser integration checks; no npm dependencies |

The deployment entry point is [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).

`js/app.js` remains the controller: it owns the account's channel/playlist
lists, feed results, loading/error state and selected `channelVideo` or
`playlistVideo`. It injects effects into this feature. The API factory holds
only a disposable channel-feed response cache; import previews are fetched
on request. Request
cancellation and UID checks discard results after sign-out or account changes.

The home page's `#discovery-home` is the single vertical scroll container. It
contains `#yt-channels` first and `#trends-board` second. Keep `min-width: 0` on
the content, home, section and rails so only the rails scroll horizontally.
Unchanged channel rows retain their DOM and scroll position when another feed
loads. Ordering and collapse updates also keep the video rail's DOM/scroll
position. Feed responses can finish during dragging; row reconciliation is
deferred until the gesture ends. Replaced rails dispose their `ResizeObserver`.

## Firestore model

Channel records reuse the **existing `playlists` collection and owner rules**:

```js
playlists/{uid}_yt_{channelId} = {
  owner: "<firebase uid>",
  kind: "youtube-channel",
  channelId: "UC…",
  title: "Channel Name",
  handle: "@ChannelName",
  thumb: "https://…",
  uploadsId: "UU…",
  url: "https://www.youtube.com/channel/UC…",
  addedAt: serverTimestamp(),
  position: 0,                     // saved order; optional on legacy records
  collapsed: false                 // optional on legacy records (default: expanded)
}
```

The deterministic ID prevents duplicate stored channels across tabs/devices.
Queries use `where("owner", "==", uid)` and filter `kind` client-side, so no
composite index is needed. `js/firestore.js:listPlaylists` excludes this kind;
channel documents never appear as empty playlists. The owner rules documented
in `documents/ARCHITECTURE.md` already cover these records; **no rule deployment
is necessary**. If the live rules were independently tightened to validate a
playlist-only schema, extend that validation for this document shape first.
Channel lists sync when a page loads; this does not add a realtime listener.

Normal sidebar playlists now save their own `position` values independently
of channel positions. Their grips use the same gesture helper with separate
selectors and scroll host; existing channel header movement and video-rail
panning remain unchanged. See the [library-order guide](../yt-playlists/README.md#library-order).

Records without positions retain their previous newest-added ordering. A new
channel receives a position before the current first item. The first reorder
normalizes all displayed positions to `0..n-1` and persists them with one
Firestore write batch, preserving channel metadata and collapse preferences.
Collapse uses an update of that channel's `collapsed` field only. No new rules
or indexes are needed. The UI updates immediately, disables competing layout
edits while saving, and restores the previous state on a failed write. Session
guards prevent a late save response from restoring another account's layout.

## API and playback details

1. `channels.list(part=snippet,contentDetails, forHandle=… / id=… / forUsername=…)`
   resolves a channel and its real uploads-playlist ID. Do not guess an uploads
   ID by replacing prefixes or use quota-heavy `search.list` for each feed.
2. `playlistItems.list(part=snippet,contentDetails, playlistId=…, maxResults=12)`
   returns recent uploads. Prefer `contentDetails.videoPublishedAt` to the
   playlist item's insertion date, deduplicate IDs and sort descending.
3. The coordinator's `playOneOff` passes the URL to `js/players/youtube.js`.
   There is one YouTube engine. `setYouTubeHost` moves its wrapper between the
   player dialog and bottom bar, deliberately destroying/recreating the SDK
   instance when the host changes: moving a live iframe would reload it and
   leave a stale player instance. Switching videos within the dialog uses the
   existing instance.
4. One-off errors retain track identity and call the coordinator's error
   callback. The popup can then offer the exact original video URL. Saved
   playlist errors still auto-skip with the existing all-unplayable guard.
5. Stopping a YouTube play clears pending lazy playback so a late iframe API
   load cannot restart a closed video. The iframe sets its `origin` explicitly.
6. Saved playlists share the popup. The coordinator invokes the app's
   `prepareTrackPlayback` through its `beforePlay` callback before loading each
   queue item, including auto-advance. The app selects the dialog host for
   YouTube and the bottom bar for audio/SoundCloud. Keep host changes before
   loading, since moving a live iframe recreates its SDK instance.

`resolvePlaylist` uses `playlists.list` for metadata and every 50-item
`playlistItems.list` page for tracks. Imports keep source order and repeated
entries; do not reuse the recent-feed deduplication, newest-first sorting,
12-video limit or ten-minute cache. Creator labels use
`videoOwnerChannelTitle`. Import limits and the normal playlist schema are in
the [playlist guide](../yt-playlists/README.md).

Each feed failure is isolated to its row. Quota errors, network failures,
not-found channels and timeouts receive readable messages; refresh can retry.
Thumbnails are lazy-loaded, and channel/video text is inserted as text, not HTML.

## Verification

From the repository root:

```powershell
node --test js/yt-channels/tests/*.test.mjs
node js/yt-channels/tests/browser.mjs
```

The browser check needs Chrome or Edge; set `CHROME_PATH` if its executable is
not in a standard location. It runs the actual app and feature modules through
a temporary localhost server, substituting auth, Firestore and YouTube service
fixtures, with native-audio and SoundCloud events also substituted. This checks
UI/integration without altering a real account or spending API quota. It does
**not** prove a live API key's restrictions, Firebase rules,
third-party embed availability or production network access; smoke-test those
with the configured key and a signed-in browser before publishing.

The browser checks cover mouse/touch row gestures, keyboard/menu alternatives,
edge scrolling, cancellation, collapse persistence, and rollback after failed
layout writes. Pointer gestures are synthetic browser events; test physical
touch behavior on the target device as part of the deployment smoke test.

The same suite covers playlist source choices, import pagination/preview/save
retry, thumbnail grids and editable rows, shared popup playback, mixed queues,
metadata-preserving autosave/navigation, M3U/empty-list creation and account
changes during lookup. The [playlist guide](../yt-playlists/README.md#verification)
records the 2026-11-28 local result and screenshot controls.

Packaging checks exercise the generated config, unchanged source, excluded
repository files, relative module imports, missing-secret failures, output-path
guards and absence of key values in CLI logs. They use fixture keys and do not
validate the secret stored on GitHub or run an actual hosted deployment.

Official references:

- [Channel lookup](https://developers.google.com/youtube/v3/docs/channels/list)
- [Uploads playlist items](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [Iframe player and errors](https://developers.google.com/youtube/iframe_api_reference)
- [Browser/API key restrictions](https://cloud.google.com/api-keys/docs/add-restrictions-api-keys)
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
