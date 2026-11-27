// ============================================================================
//  band.js — one source section: a header (brand dot + label + chart + the
//  action-mode chip + "open all") followed by either a horizontal rail of cards
//  (built by rail.js, which adds the ‹ › nav, wheel and drag scrolling) or a
//  single link-out tile. A source is shown as a tile when it is flagged `tile`
//  or simply has no tracks.
// ============================================================================

import { el } from "./dom.js";
import { metaFor } from "./sources.js";
import { buildCard } from "./card.js";
import { buildTile } from "./tile.js";
import { buildRail } from "./rail.js";

const MODE_LABEL = {
    preview: "▶ in-app preview",
    youtube: "▶ in-app",
    link: "↗ opens source"
};

export function buildBand(source, handlers) {
    const meta = metaFor(source.id);
    const asTile = source.tile || source.tracks.length === 0;
    const bodyId = `tb-content-${source.id}`;
    const toggle = el("button", { type: "button", class: "ghost tb-collapse", text: "▾",
        "aria-expanded": "true", "aria-controls": bodyId,
        "aria-label": `Collapse ${source.label}`, title: "Collapse row" });

    const head = el("div", { class: "tb-band-head" }, [
        toggle,
        el("span", { class: "tb-band-label" }, [
            el("span", { class: "tb-dot", style: `background:${meta.accent}` }),
            source.label,
            el("span", { class: "tb-band-chart", text: "· " + source.chart })
        ]),
        el("span", { class: "tb-mode", style: `--src:${meta.accent}`, text: MODE_LABEL[source.play] || "" }),
        el("button", { class: "tb-open-all", type: "button", text: "open all ↗", onclick: () => handlers.onOpen(source) })
    ]);

    const content = asTile
        ? buildTile(source, handlers.onOpen)
        : buildRail(source.tracks.map(t => buildCard(t, source, handlers.onActivate)));
    const body = el("div", { id: bodyId, class: "tb-band-body" }, [content]);

    const band = el("section", { class: "tb-band" }, [head, body]);
    toggle.addEventListener("click", () => {
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? "▸" : "▾";
        toggle.setAttribute("aria-expanded", String(!body.hidden));
        toggle.setAttribute("aria-label", `${body.hidden ? "Expand" : "Collapse"} ${source.label}`);
        toggle.title = body.hidden ? "Expand row" : "Collapse row";
        band.classList.toggle("tb-collapsed", body.hidden);
    });
    return band;
}
