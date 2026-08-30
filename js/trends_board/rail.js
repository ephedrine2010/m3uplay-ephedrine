// ============================================================================
//  rail.js — wraps a row of cards in a horizontally scrollable rail and gives
//  it the affordances a bare `overflow-x:auto` box does not have on desktop:
//
//    • ‹ › nav buttons that page by ~80% of the visible width
//    • mouse-wheel → horizontal scroll (a vertical wheel over the rail moves it
//      sideways instead of scrolling the board behind it)
//    • click-and-drag to pan with a mouse (touch already pans natively, so the
//      drag handler ignores touch/pen pointers)
//    • .at-start / .at-end classes on the wrapper so the CSS can fade the
//      arrows and the edge masks when there is nothing more to scroll to
//
//  Everything is scroll-position driven — no measuring of card widths — so it
//  stays correct when the pane resizes or the card count changes.
// ============================================================================

import { el } from "./dom.js";

const PAGE_RATIO = 0.8;      // how much of the visible width one ‹ › press moves
const DRAG_SLOP = 4;         // px of movement before a press counts as a drag

const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function buildRail(cards) {
    const rail = el("div", {
        class: "tb-rail", tabindex: "0", role: "group",
        "aria-label": "Track carousel — scroll or use the arrow keys"
    }, cards);

    const left = navButton("l", "‹", "Scroll left");
    const right = navButton("r", "›", "Scroll right");
    const wrap = el("div", { class: "tb-rail-wrap" }, [left, rail, right]);

    const page = dir => rail.scrollBy({
        left: dir * Math.max(160, rail.clientWidth * PAGE_RATIO),
        behavior: reduceMotion() ? "auto" : "smooth"
    });
    left.addEventListener("click", () => page(-1));
    right.addEventListener("click", () => page(1));

    // --- edge state -------------------------------------------------------
    function sync() {
        const max = rail.scrollWidth - rail.clientWidth;
        wrap.classList.toggle("no-scroll", max <= 1);
        wrap.classList.toggle("at-start", rail.scrollLeft <= 1);
        wrap.classList.toggle("at-end", rail.scrollLeft >= max - 1);
    }
    rail.addEventListener("scroll", sync, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(sync).observe(rail);
    // images load after the first paint and change scrollWidth
    requestAnimationFrame(sync);
    sync();

    // --- wheel: vertical scroll over the rail pans it sideways -------------
    rail.addEventListener("wheel", e => {
        if (e.ctrlKey) return;                       // leave pinch-zoom alone
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;  // already horizontal
        const max = rail.scrollWidth - rail.clientWidth;
        if (max <= 1) return;
        const unit = e.deltaMode === 1 ? 16                      // lines → px
                   : e.deltaMode === 2 ? rail.clientWidth        // pages → px
                   : 1;
        const step = e.deltaY * unit;
        // only swallow the event while the rail can still move that way, so the
        // board keeps scrolling vertically once we hit an edge
        const atEdge = (step < 0 && rail.scrollLeft <= 0) ||
                       (step > 0 && rail.scrollLeft >= max);
        if (atEdge) return;
        e.preventDefault();
        rail.scrollLeft += step;
    }, { passive: false });

    // --- drag to pan (mouse only) -----------------------------------------
    let startX = 0, startLeft = 0, dragging = false, moved = false;

    rail.addEventListener("pointerdown", e => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        if (rail.scrollWidth - rail.clientWidth <= 1) return;
        dragging = true; moved = false;
        startX = e.clientX; startLeft = rail.scrollLeft;
    });
    rail.addEventListener("pointermove", e => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) < DRAG_SLOP) return;
        if (!moved) { moved = true; rail.classList.add("dragging"); rail.setPointerCapture(e.pointerId); }
        e.preventDefault();
        rail.scrollLeft = startLeft - dx;
    });
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        rail.classList.remove("dragging");
        // let the suppressing click listener below run, then clear the flag
        if (moved) setTimeout(() => { moved = false; }, 0);
    };
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    // a drag that ends over a card must not also activate it
    rail.addEventListener("click", e => {
        if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    return wrap;
}

function navButton(side, glyph, label) {
    return el("button", {
        class: `tb-nav tb-nav-${side}`, type: "button",
        "aria-label": label, title: label, tabindex: "-1", text: glyph
    });
}
