# M3U Player — Apple UI proposal

Open **[preview.html](preview.html)** directly in a browser. No server, API key,
sign-in, build step, or internet connection is needed.

The owner approved this direction and requested implementation on 2026-11-27.
The application now uses the design; see [APPLE_UI.md](../../documents/APPLE_UI.md).
This standalone reference does not load or change
the app, Firebase records, channel subscriptions, deployment, or preferences.
All example content is illustrative and resets when the page reloads.

## Direction

- Opaque white cards on a soft grey ground; raised neutral cards in dark mode.
- Thin card edges, blue actions, platform fonts, outline Tabler icons.
- A compact sidebar for playlists and a persistent bottom player.
- Channels above Deezer and Apple Music. No removed channel headings or tips.
- Icon-only Add channel, independent collapse controls, and drag handles.
- A large video dialog with an explicit external-link location.
- A drawer replaces the sidebar on narrow screens.

## Try the preview

- Switch appearance with the sun/moon button.
- Expand/collapse any channel or trend row.
- Drag a channel by its grip, use its menu, or focus the grip and press ↑/↓.
- Click a thumbnail to inspect the player dialog; close with ×, Escape, or the backdrop.
- Use ＋ to inspect the add-channel dialog. Lookup and saving are simulated.
- Open a playlist, create a demo playlist, and inspect the import dialog.
- Resize the browser to phone width and open the library drawer.

Playback controls show their proposed appearance; they do not play media.
Video and cover artwork is original inline SVG for the proposal, not actual
uploads or artwork from the named creators. Mock lookup accepts a handle for
layout review and does not validate whether that YouTube channel exists.

## Design source

Requested skill: [pos-apple-design](../../.claude/skills/pos-apple-design/SKILL.md),
including its component and accessibility references. That skill comes from a
Flutter project; its Dart palette, type, icon package and layout helpers are
absent here. This HTML expresses the visual rules through centralized CSS
tokens and inline outline Tabler glyphs. It is a proposal, not an approved
replacement design or an exact reproduction of the missing Dart tokens.

The preview has visible keyboard focus, native dialogs, labelled icon buttons,
48 px control targets, reduced-motion support and directional CSS. Browser
layout checks cover desktop/mobile, light/dark, compact-breakpoint widths,
enlarged text and an RTL layout smoke check. Screen-reader and native Arabic
localization review remain part of implementation if the design is approved.
