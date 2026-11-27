# Personal YouTube channels

The home page displays each signed-in user's chosen YouTube channels **above**
the existing Deezer, YouTube and Apple Music trends. Anghami and Spotify were
removed from the snapshot, its generator and the renderer.

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
the GitHub Action's server-side `YT_API_KEY` secret. Server secrets must never
be copied into the browser configuration. A public-data API key does not require another
YouTube sign-in or access to a user's YouTube account.

There is no app compilation, proxy or new backend. Packaging runs only during
deployment. GitHub secrets are not available to a local static server. With
the local config empty, saved channels remain removable and a setup message is shown;
other discovery sources and playlists continue working. Live lookup and video
feeds become available once the restricted key is configured. Do not ask end
users to supply credentials in the channel dialog.

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

- **+ Add YouTube channel** opens a native modal dialog. Paste an `@handle`, a
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
- The channel's **⋯** menu offers **Open on YouTube** and **Remove channel**.
  Removal requires the app's existing confirmation popup and is saved only
  after the database delete succeeds. Removing the playing channel stops it.

## Files and ownership

| File | Responsibility |
| --- | --- |
| `config.js` | Empty key placeholder, 12-video limit, session cache lifetime |
| `prepare-pages.mjs` | Generate the deployment artifact from `YT_BROWSER_API_KEY` without changing source |
| `api.js` | Input validation, channel lookup, recent upload normalization, caching, request errors/timeouts |
| `storage.js` | Owner-scoped Firestore CRUD for saved channels |
| `view.js` | Channel identities, cards, dates, row menus and rails |
| `dialog.js` | Accessible add-channel dialog, lookup cancellation, preview and save UI |
| `index.js` | View assembly, stable row DOM, native player popup and fallback presentation |
| `style.css` | Feature styles and the shared discovery scroll container |
| `tests/*.mjs` | Standalone Node/API and browser integration checks; no npm dependencies |

The deployment entry point is [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).

`js/app.js` remains the controller: it owns the account's channel list, feed
results, loading/error state and selected video. It injects effects into this
feature. The API factory holds only a disposable response cache. Request
cancellation and UID checks discard results after sign-out or account changes.

The home page's `#discovery-home` is the single vertical scroll container. It
contains `#yt-channels` first and `#trends-board` second. Keep `min-width: 0` on
the content, home, section and rails so only the rails scroll horizontally.
Unchanged channel rows retain their DOM and scroll position when another feed
loads. Replaced rails dispose their `ResizeObserver`.

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
  addedAt: serverTimestamp()
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

Each feed failure is isolated to its row. Quota errors, network failures,
not-found channels and timeouts receive readable messages; refresh can retry.
Thumbnails are lazy-loaded, and channel/video text is inserted as text, not HTML.

## Verification

From the repository root:

```powershell
node --test js/yt-channels/tests/api.test.mjs js/yt-channels/tests/prepare-pages.test.mjs
node js/yt-channels/tests/browser.mjs
```

The browser check needs Chrome or Edge; set `CHROME_PATH` if its executable is
not in a standard location. It runs the actual app and feature modules through
a temporary localhost server, substituting auth, Firestore and YouTube service
fixtures. This checks UI/integration without altering a real account or spending
API quota. It does **not** prove a live API key's restrictions, Firebase rules,
third-party embed availability or production network access; smoke-test those
with the configured key and a signed-in browser before publishing.

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
