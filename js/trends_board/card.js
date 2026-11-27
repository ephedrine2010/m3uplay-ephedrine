// ============================================================================
//  card.js — one track card: cover, rank badge, source glyph, hover action
//  overlay, title, artist. Clicking calls onActivate(track, source); the card
//  itself is dumb — the caller (actions.js) decides play-vs-open.
// ============================================================================

import { el } from "./dom.js";
import { coverImage } from "./image.js";
import { metaFor } from "./sources.js";
import { iconText } from "../icons.js";

const isPlayable = play => play === "preview" || play === "youtube";

export function buildCard(track, source, onActivate) {
    const meta = metaFor(source.id);
    const pill = el('span', { class: 'tb-pill' });
    iconText(pill, isPlayable(source.play) ? 'play' : 'external', isPlayable(source.play) ? 'Play' : 'Open');
    const thumb = el("div", { class: "tb-thumb" }, [
        coverImage(track),
        el("span", { class: "tb-rank", text: "#" + track.rank }),
        meta.glyph && el("span", {
            class: "tb-glyph", style: `background:${meta.accent}`, text: meta.glyph
        }),
        el("span", { class: "tb-overlay" }, [
            pill
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
