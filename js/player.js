// ============================================================================
//  PLAYER  —  plays direct audio URLs via <audio>, or SoundCloud pages via
//  the SC Widget iframe. Switches modes transparently based on the URL.
// ============================================================================

let audioEl = null;
let scIframeEl = null;
let scWidget = null;
let scPlaying = false;

let queue = [];
let index = -1;
let repeat = false;
let onChange = () => {};

function isSC(url) {
    return /soundcloud\.com\//i.test(url || "");
}

export function setRepeat(on) { repeat = !!on; }
export function getRepeat() { return repeat; }

export function initPlayer(audioElement, scIframe, changeCb) {
    audioEl = audioElement;
    scIframeEl = scIframe;
    onChange = changeCb || (() => {});
    audioEl.addEventListener("ended", next);
}

export function setQueue(tracks) {
    queue = (tracks || []).filter(t => (t.url || "").trim() !== "");
    if (index >= queue.length) index = -1;
}

export function playAt(i) {
    if (i < 0 || i >= queue.length) return;
    index = i;
    const url = queue[i].url;

    if (isSC(url)) {
        audioEl.pause();
        audioEl.src = "";
        audioEl.hidden = true;
        scIframeEl.hidden = false;
        _playSC(url);
    } else {
        _pauseSC();
        scIframeEl.hidden = true;
        audioEl.hidden = false;
        audioEl.src = url;
        audioEl.play().catch(() => {});
    }
    onChange(index, queue[index]);
}

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

export function pause() {
    if (scIframeEl && !scIframeEl.hidden && scWidget) {
        scPlaying = false;
        scWidget.pause();
    } else if (audioEl) {
        audioEl.pause();
    }
}

export function resume() {
    if (scIframeEl && !scIframeEl.hidden && scWidget) {
        scPlaying = true;
        scWidget.play();
    } else if (audioEl) {
        audioEl.play().catch(() => {});
    }
}

export function isPlaying() {
    if (scIframeEl && !scIframeEl.hidden) return scPlaying;
    return !!audioEl && !audioEl.paused;
}

export function stop() {
    _pauseSC();
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
