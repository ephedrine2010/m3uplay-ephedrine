// ============================================================================
//  YOUTUBE engine — plays youtube.com / youtu.be links via the IFrame Player
//  API (iframe_api is loaded in <head>). The player is created lazily on first
//  use. ENDED → auto-advance (onEnded); PLAYING/PAUSED → UI sync; embed-blocked
//  or removed/private/region-locked videos fire onError so the coordinator can
//  warn + auto-skip.
// ============================================================================

import { isYouTube, youTubeId } from "../m3u.js";

let el = null;          // the #yt-widget wrapper
let player = null;      // YT.Player instance (created lazily)
let ready = false;      // true once the player's onReady has fired
let playing = false;
let pendingId = null;   // video id to load as soon as the player is ready
let requestedId = null;
let instanceGeneration = 0;
let cb = {};

export function init(widget, callbacks) {
    el = widget;
    cb = callbacks || {};
}

export function matches(url) { return isYouTube(url); }

export function play(url) {
    const id = youTubeId(url);
    if (!id) return;
    requestedId = id;
    if (player && ready) {
        player.loadVideoById(id);
    } else {
        pendingId = id;     // remembered; loaded on onReady
        _ensurePlayer();    // create now if the API is already up
    }
}

// The IFrame API script calls this once it's ready. We only build the player if
// a YT track is already waiting (pendingId) — keeping YouTube fully lazy (no
// iframe loaded for users who never play a YT link). If the API was already
// ready before the first click, play() → _ensurePlayer() creates it then.
window.onYouTubeIframeAPIReady = function () { if (pendingId) _ensurePlayer(); };

function _ensurePlayer() {
    if (player || !el) return;
    if (!(window.YT && window.YT.Player)) return; // API not ready yet
    const placeholder = el.querySelector("#yt-player");
    if (!placeholder) return;
    const generation = ++instanceGeneration;
    player = new window.YT.Player(placeholder, {
        height: "270",
        width: "480",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
            onReady: () => {
                if (generation !== instanceGeneration) return;
                ready = true;
                if (pendingId) { player.loadVideoById(pendingId); pendingId = null; }
            },
            onStateChange: event => { if (generation === instanceGeneration) _onState(event); },
            onError: event => { if (generation === instanceGeneration) _onError(event); }
        }
    });
}

function _onState(e) {
    if (!requestedId) return; // ignore late events after stop/source switch
    const S = window.YT.PlayerState;
    if (e.data === S.ENDED) { playing = false; cb.onEnded && cb.onEnded(); }
    else if (e.data === S.PLAYING) { playing = true; cb.onPlay && cb.onPlay(); }
    else if (e.data === S.PAUSED) { playing = false; cb.onPause && cb.onPause(); }
}

// Embed disabled by the owner (101/150) or removed/private/region-locked
// (100/2/5): nothing we can do about the video itself, so let the coordinator
// warn + auto-advance instead of stalling.
function _onError(event) {
    if (!requestedId) return;
    playing = false;
    const blocked = event.data === 101 || event.data === 150;
    const message = blocked
        ? "The creator has disabled playback on other websites."
        : "This video couldn't be played here. It may be unavailable or restricted.";
    cb.onError && cb.onError(message, { source: "youtube", code: event.data });
}

export function pause() {
    if (player && ready) { try { player.pauseVideo(); } catch { /* not ready */ } }
    playing = false;
}

export function resume() {
    if (player && ready) { playing = true; player.playVideo(); }
}

export function stop() {
    pendingId = null; // a stopped lazy player must never start when the API arrives
    requestedId = null;
    if (player && ready) { try { player.stopVideo(); } catch { /* not ready */ } }
    playing = false;
}

// Reparenting a live iframe reloads its browsing context. Recreate the SDK
// instance deliberately when switching between the bar and the channel panel.
export function setHost(host) {
    if (!el || el.parentElement === host) return;
    stop();
    instanceGeneration++; // ignore callbacks queued by the iframe being removed
    if (player) { try { player.destroy(); } catch { /* detached iframe */ } }
    player = null;
    ready = false;
    if (!el.querySelector("#yt-player")) {
        const placeholder = document.createElement("div");
        placeholder.id = "yt-player";
        el.prepend(placeholder);
    }
    el.classList.remove("collapsed");
    const toggle = el.querySelector("#yt-toggle");
    if (toggle) { toggle.textContent = "▾ Hide"; toggle.title = "Hide video"; }
    host.append(el);
}

export function isPlaying() { return playing; }

export function setActive(active) { if (el) el.hidden = !active; }
