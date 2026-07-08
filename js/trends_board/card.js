// ============================================================================
//  card.js — one track card: cover, rank badge, source glyph, hover action
//  overlay, title, artist. Clicking calls onActivate(track, source); the card
//  itself is dumb — the caller (actions.js) decides play-vs-open.
// ============================================================================

import { el } from "./dom.js";
import { coverImage } from "./image.js";
import { metaFor } from "./sources.js";

const isPlayable = play => play === "preview" || play === "youtube";

export function buildCard(track, source, onActivate) {
    const meta = metaFor(source.id);
    const thumb = el("div", { class: "tb-thumb" }, [
        coverImage(track),
        el("span", { class: "tb-rank", text: "#" + track.rank }),
        meta.glyph && el("span", {
            class: "tb-glyph", style: `background:${meta.accent}`, text: meta.glyph
        }),
        el("span", { class: "tb-overlay" }, [
            el("span", { class: "tb-pill", text: isPlayable(source.play) ? "▶ Play" : "↗ Open" })
        ])
    ]);
    return el("button", {
        class: "tb-card", type: "button",
        title: `${track.title} — ${track.artist}`,
        onclick: () => onActivate(track, source)
    }, [
        thumb,
        el("div", { class: "tb-title", text: track.title }),
        el("div", { class: "tb-artist", text: track.artist })
    ]);
}
