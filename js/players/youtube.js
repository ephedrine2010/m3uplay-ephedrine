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
let cb = {};

export function init(widget, callbacks) {
    el = widget;
    cb = callbacks || {};
}

export function matches(url) { return isYouTube(url); }

export function play(url) {
    const id = youTubeId(url);
    if (!id) return;
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
    player = new window.YT.Player(placeholder, {
        height: "90",
        width: "160",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
            onReady: () => {
                ready = true;
                if (pendingId) { player.loadVideoById(pendingId); pendingId = null; }
            },
            onStateChange: _onState,
            onError: _onError
        }
    });
}

function _onState(e) {
    const S = window.YT.PlayerState;
    if (e.data === S.ENDED) { playing = false; cb.onEnded && cb.onEnded(); }
    else if (e.data === S.PLAYING) { playing = true; cb.onPlay && cb.onPlay(); }
    else if (e.data === S.PAUSED) { playing = false; cb.onPause && cb.onPause(); }
}

// Embed disabled by the owner (101/150) or removed/private/region-locked
// (100/2/5): nothing we can do about the video itself, so let the coordinator
// warn + auto-advance instead of stalling.
function _onError() {
    playing = false;
    cb.onError && cb.onError("This video can't be played here — skipping.");
}

export function pause() {
    if (player && ready) { try { player.pauseVideo(); } catch { /* not ready */ } }
    playing = false;
}

export function resume() {
    if (player && ready) { playing = true; player.playVideo(); }
}

export function stop() { pause(); }

export function isPlaying() { return playing; }

export function setActive(active) { if (el) el.hidden = !active; }
