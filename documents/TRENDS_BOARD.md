# Trends Board (“Trending in Egypt”) — Reference

> **Last updated:** 2026-07-09
> **Audience:** developers and AI agents working on this codebase.
> **Goal:** explain the discovery board end-to-end — what it is, how the data
> gets there, how playback works, the non-obvious gotchas, and how to extend it —
> without re-reading every file.

---

## 1. What it is

A **discovery board** that shows what music is trending in Egypt/MENA, grouped by
source, and lets the user play or open each track. It is the **landing view** of
the app: it fills the right-hand `#content` pane by default (after sign-in) and
is swapped out for a playlist’s track list the moment a playlist is opened.

- **Appears** on login (before any playlist is selected).
- **Disappears** when a playlist is tapped in the sidebar.
- **Returns** when the user clicks the **🎵 M3U Player** brand (top-left).

It is deliberately a *discovery* layer, not a second player: it feeds the
existing player for the sources we can play in-app, and links out for the rest.

---

## 2. The core problem it solves

Every streaming source we care about for Egypt has a different “can we play it?”
answer. The board turns that mess into one consistent grid by matching the
**action to what each source can actually do** (the “hybrid” model):

| Source | In board | Click action | Why |
|---|---|---|---|
| **Deezer** | card row (cover art) | ▶ play 30s **preview** in-app (`<audio>`) | Public API, no key, has preview MP3s |
| **YouTube** | card row *(once keyed)* / tile | ▶ play **full** in-app (YT engine) | Data API needs a key; tile until then |
| **Apple Music** | card row (cover art) | ↗ **open** track on Apple | Free RSS feed, but no in-app playback |
| **Anghami** | single **tile** | ↗ **open** chart on Anghami | Un-embeddable (see main CLAUDE.md), no API |
| **Spotify** | single **tile** | ↗ **open** Top 50 on Spotify | Preview-only embed / Premium OAuth — skipped |

“Link out in a new tab” is always allowed (no iframe/CORS/embedding barrier), so
the sources we *can’t* embed (Anghami, Spotify) still work as tiles.

---

## 3. Architecture: snapshot → static JSON → dumb client

The client **never** talks to Deezer/Apple/YouTube directly (CORS + keys). A
scheduled job snapshots them server-side and commits one normalized JSON file
that the static client fetches same-origin.

```
GitHub Action (daily cron)                 Static client (browser)
──────────────────────────────            ─────────────────────────────────
scripts/fetch-trends.mjs                   fetch("data/trending.json")  (same-origin)
  ├─ Deezer  Top-Egypt playlist  ─┐          │
  ├─ Apple   RSS most-played EG   ├─►  data/trending.json  ──►  render grouped cards/tiles
  └─ YouTube mostPopular (if key)─┘          │
  (+ Anghami/Spotify curated tiles)          └─ on click → play in-app OR open ↗
```

Why this shape:
- **No CORS, no proxy, no API keys in the browser** — the client only fetches its
  own file.
- **Uniform** — every source is normalized to the same track shape at build time.
- Fits the project ethos: no backend, no build step for the *app* (the Action is
  separate infra). Freshness is daily, which is right for a trends board.

### Data contract — `data/trending.json`

```jsonc
{
  "updated": "2026-07-09T04:00:00Z",
  "region": "EG",
  "sources": [
    {
      "id": "deezer", "label": "Deezer", "chart": "Top Egypt",
      "play": "preview",                       // preview | youtube | link
      "chartUrl": "https://www.deezer.com/playlist/1362501615",
      "tracks": [
        { "rank": 1, "title": "…", "artist": "…",
          "thumb": "https://cdn-images.dzcdn.net/…/250x250-….jpg",
          "deezerId": 139381137,               // permanent id → fresh preview at click
          "link": "https://www.deezer.com/track/…" }
      ]
    },
    { "id": "youtube", "label": "YouTube", "chart": "Music charts · EG",
      "play": "link", "tile": true, "chartUrl": "https://charts.youtube.com/charts/TopSongs/eg",
      "tracks": [] },                          // tile: no cards until YT_API_KEY is set
    { "id": "apple", "label": "Apple Music", "play": "link", "tracks": [ /* thumb + link */ ] },
    { "id": "anghami", "label": "Anghami", "play": "link", "tile": true, "chartUrl": "…", "note": "…" },
    { "id": "spotify", "label": "Spotify", "play": "link", "tile": true, "chartUrl": "…", "note": "…" }
  ]
}
```

- A source renders as a **tile** when `tile: true` **or** it has no `tracks`.
- `play` drives the click behaviour; the renderer has no per-source `if`s.
- Track image field is `thumb`; a missing/broken image falls back to a gradient
  tile with the artist’s initials (never an empty hole).

---

## 4. The Deezer preview gotcha ⚠️ (most important non-obvious fact)

**Deezer preview URLs are signed and expire in ~15 minutes** (`…?hdnea=exp=<unix>…`).
A preview URL stored in the daily snapshot is **already dead (HTTP 403)** by the
time anyone clicks it.

**Therefore we do NOT store the preview URL.** The snapshot stores only the
permanent **`deezerId`**, and the client resolves a *fresh* preview **at click
time** via Deezer’s **JSONP** endpoint (plain `fetch()` is CORS-blocked; a
`<script>` tag is not; no API key needed):

```
GET https://api.deezer.com/track/<deezerId>?output=jsonp&callback=<cb>
   → cb({ …, "preview": "https://cdnt-preview.dzcdn.net/…mp3" })  // fresh ~15-min URL
```

Consequences to keep in mind:
- There is a **~0.5 s delay** on a Deezer click (the JSONP round-trip) before
  audio starts — expected, surfaced as a “Loading…” toast.
- If resolution fails, the click **falls back to opening the track on Deezer**.
- Because playback starts just *after* a network call, it relies on the browser’s
  **sticky activation**. Desktop Chrome/Edge/Firefox are fine. **iOS Safari** may
  need a second tap on the very first preview; if that becomes a problem, prime
  the `<audio>` element synchronously inside the click before the await.

---

## 5. File map

```
js/trends_board/
  index.js     # public entry: initTrendsBoard({ mount, deps }) → { show, hide, isVisible }
  data.js      # loadTrending() → fetch data/trending.json; relTime() for the “updated” stamp
  sources.js   # presentation-only per-source metadata (accent colour + glyph)
  deezer.js    # fetchPreview(deezerId) → fresh 30s preview URL via JSONP
  actions.js   # makeHandlers({player, resolvePreview, openExternal, notify}) → onActivate/onOpen
  board.js     # buildBoard(data, handlers) → header + note + one band per source
  band.js      # buildBand(source, handlers) → header + rail-of-cards OR a tile
  rail.js      # buildRail(cards) → the horizontal carousel: ‹ › nav, wheel→x, drag-to-pan
  card.js      # buildCard(track, source, onActivate) → one track card
  tile.js      # buildTile(source, onOpen) → one link-out tile
  image.js     # coverImage(track) → <img> with gradient+initials fallback
  dom.js       # el(tag, props, children) — tiny declarative element builder

scripts/fetch-trends.mjs        # the snapshot fetcher (Node, uses built-in https; runs on 16+ and CI)
data/trending.json              # generated snapshot the client fetches
css/trends_board.css            # all .tb-* styles (+ #brand, #trends-board); reuses style.css tokens
.github/workflows/trends.yml    # daily cron + manual dispatch → runs the fetcher, commits the JSON
```

**Separation of concerns is deliberate:** `data.js`/fetcher own *what* is
trending; `sources.js`/CSS own *how it looks*; `actions.js` owns *what a click
does*; `dom.js`/`card.js`/`tile.js`/`band.js`/`board.js` are pure render, and
`rail.js` owns *scroll behaviour only*.

---

## 5b. Horizontal scrolling of a rail (`rail.js`)

A rail is a plain `overflow-x: auto` flex row, which on a phone is enough (touch
pans it natively) but on a desktop is not: a mouse wheel over it scrolls the
board *vertically*, and the thin dark scrollbar is nearly invisible against the
dark theme. `rail.js` adds the missing affordances:

- **‹ › nav buttons** — page by 80% of the visible width, `scroll-behavior:
  smooth` (skipped under `prefers-reduced-motion`). Hidden on coarse pointers.
- **Wheel → horizontal.** A vertical wheel over the rail pans it sideways. It
  only calls `preventDefault()` while the rail can still move that way, so once
  you hit either end the wheel falls through and the board scrolls vertically
  again — no scroll trap.
- **Drag-to-pan** with the mouse (`pointerType === "mouse"` only; touch already
  pans). A drag past 4px of slop captures the pointer and swallows the trailing
  `click` so releasing over a card doesn't start playing it. The cover `<img>`
  is `draggable="false"` — otherwise the browser's native image drag steals the
  gesture.
- **Edge state.** `.at-start` / `.at-end` / `.no-scroll` are toggled on the
  wrapper from the scroll position (plus a `ResizeObserver`), and the CSS uses
  them to fade the arrows and the gradient edge masks.

**Layout gotcha:** the rail can only scroll if its ancestors refuse to widen.
`#content` is a `1fr` grid item and grid/flex items default to `min-width:
auto` (= min-content), so without an explicit **`min-width: 0`** on `#content`,
`#trends-board` and `.tb-board` the pane grows to fit the 20 cards instead of
letting the rail scroll. `#trends-board` is also pinned to `overflow-x: hidden`
so the rails are the only things that move sideways.

---

## 6. Wiring into the app

- **`index.html`** — links `css/trends_board.css`; gives the brand `id="brand"`.
- **`app.js`**
  - `initTrendsBoard({ mount: #content, deps })` where `deps` inject the player
    (`playOneOff`), `resolvePreview: fetchPreview`, `openExternal` (window.open +
    toast), and `notify` (status toast). The board module never imports app/player
    directly — everything is injected, so it stays decoupled and testable.
  - `showBoard()` = hide `#track-list`, `trendsBoard.show()`.
    `showTracks()` = `trendsBoard.hide()`, show `#track-list`.
  - Called: `showBoard()` after login; `showTracks()` in `selectPlaylist()`;
    `showBoard()` again on brand click and when the open playlist is deleted.
- **`player.js`** — three small additions (see below).

### Player hooks added to `player.js`

The coordinator is queue-based; the board needs one-off playback that is **not**
part of a saved playlist:

- `playOneOff(track)` — replaces the queue with a single `{name, url}` and plays
  it. Sets an internal `oneOff` flag.
- One-offs **stop at end instead of repeating** (so a 30s preview doesn’t loop) —
  `next()` checks `oneOff` before the repeat branch.
- `setQueue()` clears `oneOff`; opening a playlist calls `stop()` first if a
  one-off was playing.
- `isOneOff()` and `currentTrack()` — the latter returns `queue[index]` so the
  now-playing label is correct for **both** playlist tracks and one-offs
  (`app.js updateNowPlaying()` now uses it instead of `state.tracks[i]`).

A Deezer preview is a plain MP3 URL, so the existing catch-all `<audio>` engine
plays it; a YouTube one-off (`youtu.be/<id>`) reuses the YouTube engine — no new
engine was added.

---

## 7. The fetcher (`scripts/fetch-trends.mjs`)

- Uses Node’s **built-in `https`** (no deps; runs on the local Node 16 and CI’s
  Node 20). One `getJSON()` helper with redirect handling.
- **Deezer:** `GET api.deezer.com/playlist/1362501615/tracks?limit=40`, over-fetch
  then **dedupe** by `title+artist` (the chart repeats remix versions), keep the
  first 20, store `deezerId` (not the perishable preview URL). Only tracks that
  currently *have* a preview are kept.
- **Apple:** `GET rss.applemarketingtools.com/api/v2/eg/music/most-played/20/songs.json`;
  artwork upscaled `100x100bb` → `300x300bb`; `play: "link"`.
- **YouTube:** only if `process.env.YT_API_KEY` is set → Data API
  `videos.list?chart=mostPopular&videoCategoryId=10&regionCode=EG`. Otherwise a
  **link-out tile** to YouTube Charts EG.
- **Anghami/Spotify:** curated link-out tiles (constants at the top of the file).
- `safe()` wraps each source so one failure can’t kill the whole file (it falls
  back to a tile). Writes `data/trending.json`.

Run locally: `node scripts/fetch-trends.mjs`.

## 8. The Action (`.github/workflows/trends.yml`)

Daily `cron: "0 4 * * *"` + manual `workflow_dispatch`. Node 20, runs the fetcher
with `YT_API_KEY` from repo secrets (optional), and commits `data/trending.json`
only if it changed (`permissions: contents: write`).

---

## 9. How to extend / common changes

- **Turn YouTube into real cards:** create a free **YouTube Data API v3** key,
  add it as repo secret **`YT_API_KEY`**. Next snapshot fills `youtube.tracks`
  and the client renders a card row with in-app play — **no code change**.
- **Swap the Deezer chart** (its Egypt list skews eclectic — viral phonk + a
  block of 1960s oldies, because Deezer’s Egyptian userbase is small): change
  `DEEZER_EGYPT_CHART` in the fetcher to another playlist id (find one via
  `api.deezer.com/search/playlist?q=…`).
- **Add a new source:** give it an entry in the fetcher (produce `tracks` or a
  `tile`), and — for identity — an accent+glyph in `js/trends_board/sources.js`.
  The renderer needs nothing else; `play` + `tile` drive everything.
- **Change region:** `REGION` in the fetcher (Apple + YouTube use it directly;
  Deezer is a per-country playlist id, so also swap `DEEZER_EGYPT_CHART`).

---

## 10. Verification notes

The app itself gates behind Google sign-in, so the board render + click routing
were verified by executing the real modules against the real `data/trending.json`
under **jsdom** (a throwaway harness): 5 bands, 40 cards (Deezer 20 + Apple 20),
3 tiles, 40 cover images; clicks confirmed Deezer→resolve-fresh-preview→play,
Apple→open, Anghami→open. The Deezer JSONP round-trip and preview playability
(`200 audio/mpeg`) were confirmed with direct `https` calls. There is no
committed test suite (consistent with the rest of the project).
