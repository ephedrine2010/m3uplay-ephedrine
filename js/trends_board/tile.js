// ============================================================================
//  tile.js — a single link-out tile for a source with no card data.
//  Clicking opens the
//  source's chart in a new tab via onOpen(source).
// ============================================================================

import { el } from "./dom.js";
import { metaFor } from "./sources.js";
import { icon } from "../icons.js";

export function buildTile(source, onOpen) {
    const meta = metaFor(source.id);
    return el("button", {
        class: "tb-tile", type: "button", style: `--src:${meta.accent}`,
        onclick: () => onOpen(source)
    }, [
        el("span", {
            class: "tb-tile-glyph", style: `background:${meta.accent}`,
        }, [icon('music')]),
        el("span", { class: "tb-tile-main" }, [
            el("b", { text: `Open ${source.chart}` }),
            el("span", { text: source.note || `Top charts on ${source.label}` })
        ]),
        el("span", { class: "tb-tile-arrow" }, [icon('external')])
    ]);
}
