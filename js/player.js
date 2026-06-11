// ============================================================================
//  PLAYER  —  plays a queue of tracks in one of three modes, chosen per-URL:
//    • "audio"  direct audio URLs        → native <audio> element
//    • "sc"     soundcloud.com links     → SC Widget <iframe>
//    • "yt"     youtube.com / youtu.be   → YouTube IFrame API player
//  Only one mode is active at a time; switching pauses + hides the others so
//  they never overlap. All three auto-advance into the same queue.
// ============================================================================

import { isYouTube, youTubeId } from "./m3u.js";

let audioEl = null;
let scIframeEl = null;
let scWidget = null;
let scPlaying = false;

// YouTube
let ytEl = null;        // the #yt-widget wrapper
let ytPlayer = null;    // YT.Player instance (created lazily)
let ytReady = false;    // true once the player's onReady has fired
let ytPlaying = false;
let pendingYTId = null; // video id to load as soon as the player is ready

let mode = "audio";     // "audio" | "sc" | "yt" — the currently active player
let queue = [];
let index = -1;
let repeat = false;
let onChange = () => {};
let notify = () => {};  // surfaces a short user-facing message (a status toast)
let errorSkips = 0;     // consecutive unplayable tracks auto-skipped in a row

function isSC(url) {
    return /soundcloud\.com\//i.test(url || "");
}

export function setRepeat(on) { repeat = !!on; }
export function getRepeat() { return repeat; }

export function initPlayer(audioElement, scIframe, ytWidget, changeCb, notifyCb) {
    audioEl = audioElement;
    scIframeEl = scIframe;
    ytEl = ytWidget;
    onChange = changeCb || (() => {});
    notify = notifyCb || (() => {});
    audioEl.addEventListener("ended", next);
    // Any track that actually starts clears the auto-skip guard.
    audioEl.addEventListener("playing", () => { errorSkips = 0; });
}

export function setQueue(tracks) {
    queue = (tracks || []).filter(t => (t.url || "").trim() !== "");
    if (index >= queue.length) index = -1;
}

export function playAt(i) {
    if (i < 0 || i >= queue.length) return;
    index = i;
    const url = queue[i].url;
    const vid = isYouTube(url) ? youTubeId(url) : null;

    if (vid) {
        _switchMode("yt");
        _playYT(vid);
    } else if (isSC(url)) {
        _switchMode("sc");
        _playSC(url);
    } else {
        _switchMode("audio");
        audioEl.src = url;
        audioEl.play().catch(() => {});
    }
    onChange(index, queue[index]);
}

// Make `m` the only audible/visible player: pause + hide the other two.
function _switchMode(m) {
    mode = m;
    if (m !== "audio") { audioEl.pause(); audioEl.src = ""; }
    if (m !== "sc") _pauseSC();
    if (m !== "yt") _pauseYT();
    audioEl.hidden = m !== "audio";
    scIframeEl.hidden = m !== "sc";
    if (ytEl) ytEl.hidden = m !== "yt";
}

// ---- SoundCloud ------------------------------------------------------------
function _playSC(url) {
    if (scWidget) {
        scWidget.load(url, { auto_play: true });
        return;
    }
    const widgetUrl =
        "https://w.soundcloud.com/player/?url=" + encodeURIComponent(url) +
        "&auto_play=true&hide_related=true&show_comments=false" +
        "&show_user=false&show_reposts=false&visual=false";
    scIframeEl.src = widgetUrl;
    scIframeEl.addEventListener("load", _initSCWidget, { once: true });
}

function _initSCWidget() {
    if (!window.SC) return;
    scWidget = window.SC.Widget(scIframeEl);
    scWidget.bind(window.SC.Widget.Events.FINISH, () => {
        scPlaying = false;
        next();
    });
    scWidget.bind(window.SC.Widget.Events.PLAY, () => {
        scPlaying = true;
        errorSkips = 0;
        onChange(index, queue[index]);
    });
    scWidget.bind(window.SC.Widget.Events.PAUSE, () => {
        scPlaying = false;
        onChange(index, queue[index]);
    });
}

function _pauseSC() {
    if (scWidget) scWidget.pause();
    scPlaying = false;
}

// ---- YouTube ---------------------------------------------------------------
// The IFrame API script (loaded in <head>) calls this once it's ready. We only
// build the player if a YT track is already waiting (pendingYTId) — that keeps
// YouTube fully lazy (no iframe loaded for users who never play a YT link). If
// the API was already ready before the first click, _playYT() creates it then.
window.onYouTubeIframeAPIReady = function () { if (pendingYTId) _ensureYTPlayer(); };

function _ensureYTPlayer() {
    if (ytPlayer || !ytEl) return;
    if (!(window.YT && window.YT.Player)) return; // API not ready yet
    const placeholder = ytEl.querySelector("#yt-player");
    if (!placeholder) return;
    ytPlayer = new window.YT.Player(placeholder, {
        height: "90",
        width: "160",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
            onReady: () => {
                ytReady = true;
                if (pendingYTId) { ytPlayer.loadVideoById(pendingYTId); pendingYTId = null; }
            },
            onStateChange: _onYTState,
            onError: _onYTError
        }
    });
}

function _onYTState(e) {
    const S = window.YT.PlayerState;
    if (e.data === S.ENDED) {
        ytPlaying = false;
        next();
    } else if (e.data === S.PLAYING) {
        ytPlaying = true;
        errorSkips = 0;
        onChange(index, queue[index]);
    } else if (e.data === S.PAUSED) {
        ytPlaying = false;
        onChange(index, queue[index]);
    }
}

// A YouTube track that can't play here — owner disabled embedding (101/150),
// or it's removed/private/region-locked (100/2/5). Nothing we can do about the
// video itself, so warn and auto-advance instead of stalling. The guard stops
// us looping forever if every track in the queue is unplayable.
function _onYTError() {
    ytPlaying = false;
    if (++errorSkips >= queue.length) {
        errorSkips = 0;
        stop();
        notify("No playable tracks.");
        return;
    }
    notify("This video can't be played here — skipping.");
    next();
}

function _playYT(id) {
    if (ytPlayer && ytReady) {
        ytPlayer.loadVideoById(id);
    } else {
        pendingYTId = id;       // remembered; loaded on onReady
        _ensureYTPlayer();      // create now if the API is already up
    }
}

function _pauseYT() {
    if (ytPlayer && ytReady) { try { ytPlayer.pauseVideo(); } catch { /* not ready */ } }
    ytPlaying = false;
}

// ---- transport (mode-aware) ------------------------------------------------
export function pause() {
    if (mode === "yt") _pauseYT();
    else if (mode === "sc") _pauseSC();
    else if (audioEl) audioEl.pause();
}

export function resume() {
    if (mode === "yt") {
        if (ytPlayer && ytReady) { ytPlaying = true; ytPlayer.playVideo(); }
    } else if (mode === "sc") {
        if (scWidget) { scPlaying = true; scWidget.play(); }
    } else if (audioEl) {
        audioEl.play().catch(() => {});
    }
}

export function isPlaying() {
    if (mode === "yt") return ytPlaying;
    if (mode === "sc") return scPlaying;
    return !!audioEl && !audioEl.paused;
}

export function stop() {
    _pauseSC();
    _pauseYT();
    if (audioEl) {
        audioEl.pause();
        try { audioEl.currentTime = 0; } catch {}
    }
    index = -1;
    onChange(index, null);
}

export function next() {
    if (index + 1 < queue.length) {
        playAt(index + 1);
    } else if (repeat && queue.length > 0) {
        playAt(0);
    }
}

export function prev() {
    if (index - 1 >= 0) playAt(index - 1);
}

export function playingIndex() {
    return index;
}
