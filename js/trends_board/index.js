// ============================================================================
//  index.js — public entry for the trends board. Owns a container mounted inside
//  #content, loads the snapshot once (lazily, on first show), renders it, and
//  exposes show()/hide()/isVisible() so app.js can swap between the board and a
//  selected playlist's track list.
//
//  Usage (from app.js):
//      const board = initTrendsBoard({
//          mount: document.querySelector("#content"),
//          deps: { player: { playOneOff }, openExternal, notify }
//      });
//      board.show();
// ============================================================================

import { el } from "./dom.js";
import { loadTrending } from "./data.js";
import { buildBoard } from "./board.js";
import { makeHandlers } from "./actions.js";

export function initTrendsBoard({ mount, deps, dataUrl = "data/trending.json" }) {
    const container = el("div", { id: "trends-board", class: "hidden" });
    mount.appendChild(container);
    const handlers = makeHandlers(deps);
    let loaded = false;

    async function render() {
        try {
            const data = await loadTrending(dataUrl);
            container.replaceChildren(buildBoard(data, handlers));
            loaded = true;
        } catch (e) {
            container.replaceChildren(el("div", {
                class: "tb-error",
                text: "Couldn't load trends right now — check back shortly."
            }));
        }
    }

    return {
        async show() {
            if (!loaded) await render();
            container.classList.remove("hidden");
        },
        hide() { container.classList.add("hidden"); },
        isVisible() { return !container.classList.contains("hidden"); }
    };
}
