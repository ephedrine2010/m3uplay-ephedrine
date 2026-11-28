# YouTube playlist imports and thumbnail playback

Last updated: 2026-11-28.

This feature adds an editable copy of a YouTube playlist to the signed-in
user's library. It shares YouTube metadata access with
[personal channels](../yt-channels/README.md) and uses the existing YouTube
player dialog. Channel subscriptions and imported playlists are separate
library features.

## User flow

1. Open **Playlists → + → Add YouTube playlist**. The same source menu offers
   **Create empty playlist** and **Import M3U file**. Escape closes the menu
   and returns focus to its + button without closing an open library drawer.
2. Paste a playlist link and select **Preview**. A YouTube video share link
   also works when it contains the playlist's `list=` parameter. YouTube Music,
   mobile YouTube and `youtu.be` links with that parameter are supported.
3. Preview shows the playlist title, importable video count and how many
   unavailable entries will be skipped. Optionally change **Name in your
   library**, then select **Import**. A failed save keeps the dialog open for
   retry; preview alone does not create a database record.
4. The new playlist appears in the rail with a play icon and opens as a
   responsive thumbnail gallery. Each card has a 16:9 image, title, creator or
   source label, and move-up/move-down/remove controls. **Add track** accepts
   additional YouTube, SoundCloud and direct audio links.

An import is a snapshot. Changes on YouTube do not refresh the saved copy,
and local edits do not change the source playlist. Importing the same source
again creates another independent copy.

```text
Playlists [+]                 Evening sessions
  My favourites              24 tracks · Imported from YouTube · Editable copy
  Evening sessions
                             [ thumbnail ] [ thumbnail ]
                             Video title   Video title
                             Creator       Creator
```

## Layout and playback

| Playlist | Presentation | Editing |
| --- | --- | --- |
| Imported from YouTube (`source: "youtube"`) | Responsive thumbnail grid | Add track, move up/down, confirmed removal |
| Created manually or imported from M3U | Rows with smaller thumbnails | Existing add/move/remove controls |

Artwork uses the saved HTTPS `thumb` when present. A valid YouTube video URL
can supply its standard thumbnail even when added manually. Other tracks use
a music placeholder when artwork is absent; failed images also fall back.
SoundCloud artwork lookup and M3U artwork-tag parsing are not implemented.
The card/row shows `channelTitle` when available, otherwise YouTube, SoundCloud
or Audio. Track names and URLs are not edited inline; delete and re-add to
change them.

Selecting a YouTube item in **any** playlist opens the same native player
dialog used by channel thumbnails. The selected item shows Playing/Paused,
and popup and bottom transport controls stay synchronized. Closing with ×,
Escape or the backdrop stops playback; closing a playlist video restores
focus to its thumbnail. Playlist selection and Home navigation stop playback
and dismiss the popup. The list's scroll position is retained when closing
the player.

Playlist queues advance automatically, repeat under the existing always-on
repeat setting, and skip playback errors with the existing all-unplayable
guard. Channel videos remain one-off plays: they stop at the end and show an
explicit Watch on YouTube link if embedding fails. In mixed playlists, direct
audio and SoundCloud items use their existing bottom players; advancing to
YouTube opens the popup again. Playback routing follows each item's URL,
independently of the playlist's `source`.

## Metadata access and limits

The feature uses the same `YT_BROWSER_API_KEY` deployment configuration as
channel lookup. Follow the [existing setup guide](../yt-channels/README.md#one-time-setup).
Keep tracked `js/yt-channels/config.js` empty; the Pages preparation script
generates a configured artifact. An unconfigured local source checkout can
still edit saved lists and play individual YouTube URLs, but cannot look up
channels or import YouTube playlists.

The importer requests `playlists.list(part=snippet,contentDetails, id=…)`, then
every `playlistItems.list(part=snippet,contentDetails, maxResults=50)` page.
It preserves playlist order and repeated videos. This differs from channel
feeds, which deduplicate videos, sort by publication date and show up to 12.
Video creator labels come from `snippet.videoOwnerChannelTitle`, rather than
the playlist curator's name. Playlist previews are fetched on request; the
channel feed's ten-minute cache is not used for imports.

- Public playlists are the supported import flow. Private account access and
  YouTube OAuth are not implemented. Mixes (`RD…`), Watch later and history
  are rejected.
- Up to **500 source entries**, including unavailable entries, are accepted.
  The reported count is checked before pagination and the fetched count is
  checked during pagination. Oversized lists fail without saving a partial
  copy. Serialized track metadata also has a **750,000-byte** import guard
  to leave room for database document overhead.
- Entries with invalid video IDs or Private video/Deleted video titles are
  skipped. An import with no remaining videos fails. Availability in the
  preview does not guarantee that a video will embed at playback time.
- Missing configuration, credential restrictions, quota, network, private or
  missing playlists, timeouts and incomplete pagination produce readable
  errors. Closing/changing a preview cancels it. Account changes close the
  dialog and discard late results; the import controller checks the UID
  after saving before changing the visible library.

## Storage and controller responsibilities

An imported playlist is a normal document in the existing `playlists`
collection, with optional source metadata:

```js
{
  owner: "<firebase uid>",
  name: "Evening sessions",
  source: "youtube",
  sourceUrl: "https://www.youtube.com/playlist?list=PL…",
  youtubePlaylistId: "PL…",
  tracks: [
    {
      name: "Video title",
      url: "https://www.youtube.com/watch?v=…",
      thumb: "https://…",
      channelTitle: "Video creator"
    }
  ],
  updatedAt: serverTimestamp()
}
```

Manual/M3U playlists do not need the source fields. Optional track `thumb` and
`channelTitle` survive editing and saving. Existing owner-based Firestore rules
cover this shape; no new collection or index is required. Channel documents
are still excluded from the rail by `kind: "youtube-channel"`; imported
playlists must remain in normal playlist results.

`scheduleSave()` updates the local playlist cache and debounces database
writes. Selecting another playlist or Home flushes a pending edit with its
original playlist ID and UID captured before the asynchronous write.
Account changes clear pending save timers and the previous visible library.
M3U download exports names and URLs using the existing serializer; it does
not round-trip YouTube source metadata, thumbnail URLs or creator labels.

| File | Responsibility |
| --- | --- |
| `dialog.js` | Transient preview/name/loading/save state, cancellation, validation and import UI |
| `../yt-channels/api.js` | `parsePlaylistInput`, `resolvePlaylist`, full pagination, normalization and shared request errors |
| `../app.js` | Source menu, account state, import persistence, grid/row rendering, autosave and player presentation |
| `../firestore.js` | `createPlaylist(uid, name, tracks, metadata)` stores optional YouTube source fields |
| `../player.js` | Queue, auto-advance, repeat and `beforePlay` hook |
| `../yt-channels/index.js` | Shared player dialog mounted under `document.body`, outside the hidden Home container |
| `../../css/apple.css` | Source menu, gallery, artwork rows and compact layouts |

`prepareTrackPlayback` is supplied as the final `initPlayer` callback. It
selects the iframe host **before** the engine loads each track, including
automatic queue changes. Host changes deliberately recreate the YouTube SDK
instance because moving a live iframe reloads it; consecutive YouTube items
within the same dialog reuse the instance. Keep application state in `app.js`
and preserve this ordering when changing playback.

## Verification

From the repository root, with Node and an existing Chromium executable:

```sh
node --test js/yt-channels/tests/*.test.mjs
CHROME_PATH='/absolute/path/to/chromium' node js/yt-channels/tests/browser.mjs
CHROME_PATH='/absolute/path/to/chromium' YT_CHANNELS_WINDOW_SIZE=390,844 node js/yt-channels/tests/browser.mjs
```

The shared tests cover playlist URL validation, full pagination, retained
order/repeats, creator metadata, private/empty/oversized inputs, cancellation,
preview/save retry, thumbnails, safe titles, popup pause/resume, automatic
advance past blocked videos, mixed-source queues, focus restoration,
immediate playlist switching after edits, M3U/empty-list creation and account
isolation. The browser harness substitutes auth, database transport, YouTube
responses/SDK, native audio events and SoundCloud widget events; it does not
exercise real provider playback or production configuration.

Local verification on 2026-11-28 passed **19 Node tests**, **103 desktop browser
checks** at 1280×900 and **107 phone browser checks** at 390×844. Gallery and
popup screenshots were reviewed. This records local verification, not a
hosted deployment or live-account test.

For screenshots, set `YT_CHANNELS_SCREENSHOT` to an output PNG path and
`YT_PLAYLISTS_SCREENSHOT_VIEW=gallery` or `player`. Optional
`YT_CHANNELS_APPEARANCE=light` or `dark` selects the appearance. Other browser
options are listed in the [UI reference](../../documents/APPLE_UI.md#verification).
