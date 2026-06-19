// ============================================================================
//  SOUNDCLOUD engine — plays soundcloud.com links in an <iframe> via the SC
//  Widget API (api.js is loaded in <head>). FINISH → auto-advance (onEnded),
//  PLAY/PAUSE → UI sync (onPlay/onPause).
// ============================================================================

let el = null;        // the <iframe id="sc-widget">
let widget = null;    // SC.Widget instance (created on first load)
let playing = false;
let cb = {};

export function init(iframe, callbacks) {
    el = iframe;
    cb = callbacks || {};
}

export function matches(url) { return /soundcloud\.com\//i.test(url || ""); }

export function play(url) {
    if (widget) {
        widget.load(url, { auto_play: true });
        return;
    }
    el.src =
        "https://w.soundcloud.com/player/?url=" + encodeURIComponent(url) +
        "&auto_play=true&hide_related=true&show_comments=false" +
        "&show_user=false&show_reposts=false&visual=false";
    el.addEventListener("load", _initWidget, { once: true });
}

function _initWidget() {
    if (!window.SC) return;
    widget = window.SC.Widget(el);
    widget.bind(window.SC.Widget.Events.FINISH, () => { playing = false; cb.onEnded && cb.onEnded(); });
    widget.bind(window.SC.Widget.Events.PLAY, () => { playing = true; cb.onPlay && cb.onPlay(); });
    widget.bind(window.SC.Widget.Events.PAUSE, () => { playing = false; cb.onPause && cb.onPause(); });
}

export function pause() { if (widget) widget.pause(); playing = false; }

export function resume() { if (widget) { playing = true; widget.play(); } }

export function stop() { pause(); }

export function isPlaying() { return playing; }

export function setActive(active) { el.hidden = !active; }
