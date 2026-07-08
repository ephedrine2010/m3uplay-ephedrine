// ============================================================================
//  board.js — assembles the whole board element: title, the "how it behaves"
//  note, and one band per source in the order the data file lists them.
// ============================================================================

import { el } from "./dom.js";
import { buildBand } from "./band.js";
import { relTime } from "./data.js";

export function buildBoard(data, handlers) {
    const head = el("div", { class: "tb-head" }, [
        el("h1", { text: "🔥 Trending in Egypt" }),
        el("span", { class: "tb-sub", text: "updated " + relTime(data.updated) })
    ]);
    const note = el("div", {
        class: "tb-note", html:
            "👆 <b>Tip:</b> Deezer plays a 30&#8209;second preview and YouTube plays in&#8209;app; " +
            "Apple, Anghami &amp; Spotify open on their own site."
    });
    const bands = data.sources.map(s => buildBand(s, handlers));
    return el("div", { class: "tb-board" }, [head, note, ...bands]);
}
