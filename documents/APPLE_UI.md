# Apple UI

Last updated: 2026-11-28.

The owner approved the HTML proposal in `design/apple-ui/` on 2026-11-27.
The implementation adapts the requested `pos-apple-design` guidance from
Flutter to this project's native HTML/CSS/JS. The original local skill under
`.claude/skills/pos-apple-design/` is excluded from Git and is not present in
this checkout. Its Dart theme files are also absent, so the HTML palette and
metrics are centralized CSS interpretations rather than imported Flutter tokens.

## Files and responsibilities

- `css/apple.css` is loaded last, after the base and feature styles. It owns
  appearance tokens, the app grid, cards, controls and responsive treatment.
  Existing feature styles retain the rail, drag and media layout mechanics.
- `js/icons.js` supplies static outline Tabler SVG glyphs and `iconText()`.
  Icon paths come from code; account/channel/track text still uses text nodes.
- `js/ui.js` owns only appearance and the mobile library's focus lifecycle.
  All account, playlist, channel and playback state remains in `js/app.js`.
- `index.html` supplies the toolbar, sidebar, account area and native playlist
  dialogs. Channel and trend renderers share the same visual treatment.
- `js/yt-playlists/dialog.js` supplies the native YouTube import preview/name
  dialog. `js/app.js` renders imported galleries and manual/M3U artwork rows;
  see the [playlist guide](../js/yt-playlists/README.md).
- `design/apple-ui/preview.html` is the original standalone, simulated design
  reference. Its sample content and playback simulation are not app behavior.

## Interaction

The desktop library sits beside the Home/playlist content. On screens at or
below 800 CSS px, the menu button opens the library as a drawer. Its background
is inert, Tab stays inside, and Escape/backdrop/Close dismiss it and restore
focus. Navigation closes the drawer. Resizing clears stale drawer isolation.

The sun/moon button changes light/dark appearance. It initially follows the
device preference and stores an explicit choice in localStorage at
`m3u-appearance`. Storage failure still permits switching for the current
session. Appearance is device-local; channel order/collapse remains per account.

Channels remain above Deezer/Apple Music, without the removed headings and
instruction banners. Add channel is a labelled + icon in the Home toolbar.
The playlist toolbar instead shows its title, Play all/Pause/Continue,
Add track and Download. Channel Refresh is an icon on desktop and is also
available in the channel menu on every screen size. Drag/collapse/menu
controls have 48 px targets. Each trend header retains its own collapse
control and playback-mode description.

New playlist, YouTube import, Add track and delete confirmation use native
modal dialogs for focus containment. Import lookup is cancellable; controls
are disabled during saving and a failed save can be retried in the dialog.
The existing YouTube popup, creator embedding restrictions and channel
one-off Watch on YouTube fallback are preserved.
The media engines and native/provider controls remain responsible for playback;
the design does not add decorative seek bars or simulated media controls.

### Playlist library and artwork

The rail's **+** opens **Create empty playlist**, **Add YouTube playlist** and
**Import M3U file**. Escape closes these choices and returns focus to + while
keeping an open library drawer available. Imported YouTube playlists use a
play icon in the rail; other playlists keep the list icon.

Every sidebar playlist also has a grip for vertical mouse/touch dragging,
including YouTube imports. Focusing it and pressing ↑/↓ moves the playlist
with a keyboard. Dragging shows a floating preview and scrolls the library
near its edges; Escape or pointer cancellation restores the previous order
without a write. Escape during dragging keeps the compact library open.
Drop saves positions per account, preserving the current selection/playback.
Controls prevent competing edits during save; failures restore the previous
positions. Existing lists stay alphabetical until rearranged. Saved positions
take priority over unpositioned/new lists, which follow alphabetically.

YouTube import previews the title and usable-video count, reports skipped
unavailable entries, and offers an editable local name before saving. The
saved copy opens a responsive **16:9 thumbnail grid** with video title,
creator/source label, and move-up/move-down/remove controls. Manual/M3U lists
retain rows with smaller thumbnails and the same editing actions. Missing or
failed artwork uses a music placeholder. A valid manually added YouTube video
can display its thumbnail without an import. SoundCloud artwork lookup is not
part of this feature.

The grid adapts to available width; screens ≤560 px use two columns and those
≤360 px use one. Narrow manual rows place editing actions below the artwork
and title. The selected playlist keeps Play all/Pause/Continue, Add track and
Download in the toolbar, plus a track-count/source description above its items.
The import's limits and storage model are in the
[playlist guide](../js/yt-playlists/README.md#metadata-access-and-limits).

### Shared YouTube popup

Selecting a YouTube item in any playlist opens the same native `.yc-player`
dialog as channel thumbnails. It lives under `document.body` so hiding Home
does not hide it. The active thumbnail displays Playing/Paused, synchronized
with the popup and bottom transport. Close, Escape or backdrop click stops
playback; closing a playlist video restores focus to its thumbnail while
retaining the gallery's scroll position.

Saved queues advance automatically under the existing repeat setting. In a
mixed list, audio/SoundCloud entries use the bottom players and the next
YouTube entry reopens the popup. Selecting another playlist or Home closes the
popup, stops playback and flushes pending edits. Previous/Next buttons have
not been added to the popup. Channel videos remain one-off plays that stop at
the end and offer Watch on YouTube for unavailable embeds.

Cards are opaque, have a 1 px edge and no shadow. Controls use blue action and
selection colors, outline icons, visible keyboard focus and neutral surfaces.
Content keeps one vertical scroll pane; video/music rails scroll horizontally.
Reduced-motion and increased-contrast preferences have CSS treatments. Browser
zoom is enabled; text uses rem sizes and names wrap in narrow layouts.

## Verification

Run the API/preferences/packaging checks documented in `CLAUDE.md`, then:

```powershell
node js/yt-channels/tests/browser.mjs
$env:YT_CHANNELS_WINDOW_SIZE = '390,844'
node js/yt-channels/tests/browser.mjs
```

The browser harness runs the real app modules with mocked authentication,
Firestore transport, YouTube metadata and iframe SDK. It covers the existing
channel/player flows plus appearance persistence, native playlist dialogs,
drawer focus/isolation, source-menu keyboard behavior, import preview/retry,
gallery/row layouts, mixed queues, autosave navigation, sidebar drag/keyboard
ordering, cancellation, rollback, account isolation and viewport geometry.
Native audio and SoundCloud events are also fixtures. Optional environment variables:

- `YT_CHANNELS_WINDOW_SIZE`: exact CSS viewport, e.g. `1366,768` or `801,900`.
- `YT_CHANNELS_TEXT_SCALE`: root text size, e.g. `200%`.
- `YT_CHANNELS_RTL`: nonempty value for a directional-layout smoke check.
- `YT_CHANNELS_SCREENSHOT`: output PNG path; leaves Home visible by default.
- `YT_CHANNELS_APPEARANCE`: `light` or `dark` for that final screenshot.
- `YT_PLAYLISTS_SCREENSHOT_VIEW`: with screenshot output enabled, `gallery`
  opens the fixture's imported playlist and `player` also opens its video popup.

The [playlist guide](../js/yt-playlists/README.md#verification) records the latest
local test counts and viewports. Gallery and phone-popup screenshots were
visually reviewed; the displayed media and account data were fixtures.

These automated checks do not replace a screen-reader review, full Arabic
localization or live Google/YouTube playback testing.
