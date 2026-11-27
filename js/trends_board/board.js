// ============================================================================
//  board.js — assembles the title and one collapsible band per source in the
//  order the data file lists them.
// ============================================================================

import { el } from "./dom.js";
import { buildBand } from "./band.js";
import { relTime } from "./data.js";

export function buildBoard(data, handlers) {
    const head = el("div", { class: "tb-head" }, [
        el("h2", { text: "Trending in Egypt" }),
        el("span", { class: "tb-sub", text: "updated " + relTime(data.updated) })
    ]);
    // Also filter older snapshots cached before these sources were removed.
    const bands = data.sources.filter(s => !["youtube", "anghami", "spotify"].includes(s.id))
        .map(s => buildBand(s, handlers));
    return el("div", { class: "tb-board" }, [head, ...bands]);
}
