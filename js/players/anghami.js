// ============================================================================
//  ANGHAMI engine — plays anghami.com links in a plain embed <iframe>.
//  Anghami exposes NO JavaScript control API, so this engine is deliberately
//  limited:
//    • the user plays/pauses with Anghami's own buttons inside the frame,
//    • isPlaying() can't be known → always returns false,
//    • there is no FINISH event → the queue does NOT auto-advance off it,
//    • the only way to silence it is to UNLOAD the iframe (src=about:blank),
//      which also loses the track's position — resume() reloads it fresh.
//  The host is normalized to play.anghami.com (the marketing site blocks
//  framing); see anghamiEmbedUrl() in m3u.js.
// ============================================================================

import { isAnghami, anghamiEmbedUrl } from "../m3u.js";

let el = null;
let lastUrl = null;

export function init(iframe) { el = iframe; }

export function matches(url) { return isAnghami(url); }

export function play(url) {
    lastUrl = url;
    if (el) el.src = anghamiEmbedUrl(url);
}

export function pause() { stop(); }            // no API: unload to silence (forgets position)

export function resume() { if (lastUrl) play(lastUrl); } // no API: reload the widget fresh

export function stop() {
    if (el && el.getAttribute("src")) el.src = "about:blank";
}

export function isPlaying() { return false; }  // no API: we can never know

export function setActive(active) { if (el) el.hidden = !active; }
