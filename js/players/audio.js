// ============================================================================
//  AUDIO engine — plays direct audio URLs via the native <audio> element.
//  This is the catch-all engine: matches() always returns true, so the
//  coordinator falls back to it for any URL no other engine claims. Keep it
//  LAST in the coordinator's engine list.
// ============================================================================

let el = null;
let cb = {};

export function init(audioEl, callbacks) {
    el = audioEl;
    cb = callbacks || {};
    el.addEventListener("ended", () => cb.onEnded && cb.onEnded());
    // Any track that actually starts clears the coordinator's auto-skip guard.
    el.addEventListener("playing", () => cb.onPlay && cb.onPlay());
    el.addEventListener("pause", () => cb.onPause && cb.onPause());
}

export function matches() { return true; } // catch-all

export function play(url) {
    el.src = url;
    el.play().catch(() => {});
}

export function pause() { el.pause(); }

export function resume() { el.play().catch(() => {}); }

export function stop() {
    el.pause();
    el.src = "";
    try { el.currentTime = 0; } catch {}
}

export function isPlaying() { return !!el && !el.paused; }

export function setActive(active) { el.hidden = !active; }
