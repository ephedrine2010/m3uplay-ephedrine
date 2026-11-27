// ============================================================================
//  band.js — one source section: a header (brand dot + label + chart + the
//  action-mode chip + "open all") followed by either a horizontal rail of cards
//  (built by rail.js, which adds the ‹ › nav, wheel and drag scrolling) or a
//  single link-out tile. A source is shown as a tile when it is flagged `tile`
//  or simply has no tracks.
// ============================================================================

import { el } from "./dom.js";
import { buildCard } from "./card.js";
import { buildTile } from "./tile.js";
import { buildRail } from "./rail.js";
import { icon, iconText } from "../icons.js";

const MODE_LABEL = {
    preview: "30 sec preview",
    youtube: "In-app",
    link: "Opens source"
};

export function buildBand(source, handlers) {
    const asTile = source.tile || source.tracks.length === 0;
    const bodyId = `tb-content-${source.id}`;
    const toggle = el("button", { type: "button", class: "ghost tb-collapse", text: "▾",
        "aria-expanded": "true", "aria-controls": bodyId,
        "aria-label": `Collapse ${source.label}`, title: "Collapse row" });

    toggle.replaceChildren(icon('chevron'));
    const label = el('span', { class: 'tb-band-label' }, [
        icon(source.id === 'deezer' ? 'chart' : 'music'),
        el('span', { class: 'tb-source-identity' }, [el('strong', { text: source.label }),
            el('span', { class: 'tb-band-chart', text: source.chart })])
    ]);
    const open = el('button', { class: 'tb-open-all', type: 'button', title: `Open ${source.label} chart`,
        'aria-label': `Open ${source.label} chart`, onclick: () => handlers.onOpen(source) });
    open.append(icon('external'));
    const mode = el('span', { class: 'tb-mode' });
    iconText(mode, source.play === 'preview' ? 'play' : 'external', MODE_LABEL[source.play] || '');
    const head = el("div", { class: "tb-band-head" }, [
        toggle,
        label, mode, open
    ]);

    const content = asTile
        ? buildTile(source, handlers.onOpen)
        : buildRail(source.tracks.map(t => buildCard(t, source, handlers.onActivate)));
    const body = el("div", { id: bodyId, class: "tb-band-body" }, [content]);

    const band = el("section", { class: "tb-band" }, [head, body]);
    toggle.addEventListener("click", () => {
        body.hidden = !body.hidden;
        toggle.setAttribute("aria-expanded", String(!body.hidden));
        toggle.setAttribute("aria-label", `${body.hidden ? "Expand" : "Collapse"} ${source.label}`);
        toggle.title = body.hidden ? "Expand row" : "Collapse row";
        band.classList.toggle("tb-collapsed", body.hidden);
    });
    return band;
}
