// ============================================================================
//  image.js — builds a cover thumbnail for a track. Returns a lazy <img> of the
//  real source artwork, but swaps in a deterministic gradient tile (with the
//  artist's initials) if the URL is missing or fails to load — so a dead
//  thumbnail never leaves an empty hole in a rail.
// ============================================================================

import { el } from "./dom.js";

const GRADIENTS = [
    ["#6d28d9", "#db2777"], ["#0ea5e9", "#1e3a8a"], ["#f59e0b", "#b91c1c"],
    ["#10b981", "#065f46"], ["#ef4444", "#7c2d12"], ["#8b5cf6", "#312e81"],
    ["#ec4899", "#831843"], ["#14b8a6", "#0f766e"], ["#f43f5e", "#4c0519"],
    ["#3b82f6", "#1e1b4b"], ["#eab308", "#713f12"], ["#22d3ee", "#155e75"],
];

function pick(seed) {
    let h = 0;
    for (const ch of (seed || "x")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return GRADIENTS[h % GRADIENTS.length];
}

const initials = s => (s || "?")
    .split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();

function placeholder(track) {
    const [c1, c2] = pick(track.artist || track.title);
    return el("div", {
        class: "tb-thumb-ph",
        style: `background:linear-gradient(135deg,${c1},${c2})`,
        text: initials(track.artist || track.title)
    });
}

export function coverImage(track) {
    if (!track.thumb) return placeholder(track);
    const img = el("img", {
        class: "tb-thumb-img", src: track.thumb, alt: "",
        loading: "lazy", decoding: "async"
    });
    img.addEventListener("error", () => img.replaceWith(placeholder(track)), { once: true });
    return img;
}
