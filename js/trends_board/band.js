// ============================================================================
//  band.js — one source section: a header (brand dot + label + chart + the
//  action-mode chip + "open all") followed by either a horizontal rail of cards
//  or a single link-out tile. A source is shown as a tile when it is flagged
//  `tile` or simply has no tracks.
// ============================================================================

import { el } from "./dom.js";
import { metaFor } from "./sources.js";
import { buildCard } from "./card.js";
import { buildTile } from "./tile.js";

const MODE_LABEL = {
    preview: "▶ in-app preview",
    youtube: "▶ in-app",
    link: "↗ opens source"
};

export function buildBand(source, handlers) {
    const meta = metaFor(source.id);
    const asTile = source.tile || source.tracks.length === 0;

    const head = el("div", { class: "tb-band-head" }, [
        el("span", { class: "tb-band-label" }, [
            el("span", { class: "tb-dot", style: `background:${meta.accent}` }),
            source.label,
            el("span", { class: "tb-band-chart", text: "· " + source.chart })
        ]),
        el("span", { class: "tb-mode", style: `--src:${meta.accent}`, text: MODE_LABEL[source.play] || "" }),
        el("button", { class: "tb-open-all", type: "button", text: "open all ↗", onclick: () => handlers.onOpen(source) })
    ]);

    const body = asTile
        ? buildTile(source, handlers.onOpen)
        : el("div", { class: "tb-rail" }, source.tracks.map(t => buildCard(t, source, handlers.onActivate)));

    return el("section", { class: "tb-band" }, [head, body]);
}
