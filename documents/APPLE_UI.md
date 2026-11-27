# Apple UI

The owner approved the HTML proposal in `design/apple-ui/` on 2026-11-27.
The implementation follows the requested
[pos-apple-design skill](../.claude/skills/pos-apple-design/SKILL.md), adapted
from Flutter to this project's native HTML/CSS/JS. The skill's Dart theme
files are not present, so the HTML palette and metrics are centralized CSS
interpretations rather than imported Flutter tokens.

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

New playlist, Add track and delete confirmation use native modal dialogs for
focus containment and Escape dismissal. The existing YouTube popup, creator
embedding restrictions and explicit Watch on YouTube fallback are preserved.
The media engines and native/provider controls remain responsible for playback;
the design does not add decorative seek bars or simulated media controls.

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
drawer focus/isolation and viewport geometry. Optional environment variables:

- `YT_CHANNELS_WINDOW_SIZE`: exact CSS viewport, e.g. `1366,768` or `801,900`.
- `YT_CHANNELS_TEXT_SCALE`: root text size, e.g. `200%`.
- `YT_CHANNELS_RTL`: nonempty value for a directional-layout smoke check.
- `YT_CHANNELS_SCREENSHOT`: output PNG path; leaves Home visible after checks.
- `YT_CHANNELS_APPEARANCE`: `light` or `dark` for that final screenshot.

These automated checks do not replace a screen-reader review, full Arabic
localization or live Google/YouTube playback testing.
