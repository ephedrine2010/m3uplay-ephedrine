// ============================================================================
//  PLAYER  —  coordinator. Owns the queue + current index and delegates actual
//  playback to one of the per-source engines in ./players/, chosen per-URL:
//    • players/audio.js       direct audio URLs    → native <audio> (catch-all)
//    • players/soundcloud.js  soundcloud.com        → SC Widget <iframe>
//    • players/youtube.js     youtube.com/youtu.be  → YouTube IFrame API
//  Every engine exposes the same interface — init / matches / play / pause /
//  resume / stop / isPlaying / setActive — and reports back through the shared
//  `callbacks`. Only one engine is active at a time; switching stops + hides
//  the others so they never overlap. All three auto-advance into the queue.
// ============================================================================

import * as audio from "./players/audio.js";
import * as soundcloud from "./players/soundcloud.js";
import * as youtube from "./players/youtube.js";

let engines = [];       // specific engines first, audio (catch-all) last
let active = null;      // the engine currently selected
let queue = [];
let index = -1;
let repeat = false;
let onChange = () => {};
let notify = () => {};  // surfaces a short user-facing message (a status toast)
let errorSkips = 0;     // consecutive unplayable tracks auto-skipped in a row
let oneOff = false;     // true while playing a single ad-hoc track (trends board)

// Events every engine reports back through. The coordinator owns the queue, so
// auto-advance, the auto-skip guard and the change notifications all live here.
const callbacks = {
    onPlay:  () => { errorSkips = 0; onChange(index, queue[index]); },
    onPause: () => onChange(index, queue[index]),
    onEnded: () => next(),
    onError: (msg) => {
        // A track that can't play here. Warn and auto-advance, but a per-queue
        // guard stops us looping forever if every track is unplayable.
        if (++errorSkips >= queue.length) {
            errorSkips = 0;
            stop();
            notify("No playable tracks.");
            return;
        }
        notify(msg || "Can't play this track — skipping.");
        next();
    }
};

export function setRepeat(on) { repeat = !!on; }
export function getRepeat() { return repeat; }

export function initPlayer(audioElement, scIframe, ytWidget, changeCb, notifyCb) {
    onChange = changeCb || (() => {});
    notify = notifyCb || (() => {});
    audio.init(audioElement, callbacks);
    soundcloud.init(scIframe, callbacks);
    youtube.init(ytWidget, callbacks);
    // Order matters: audio.matches() is a catch-all, so it must come last.
    engines = [youtube, soundcloud, audio];
}

export function setQueue(tracks) {
    queue = (tracks || []).filter(t => (t.url || "").trim() !== "");
    if (index >= queue.length) index = -1;
    oneOff = false;   // any explicit playlist queue exits one-off mode
}

// Play a single ad-hoc track that is NOT part of a saved playlist — used by the
// trends board for Deezer previews and one-off YouTube plays. Replaces the queue
// with just this track; because it's a one-off, it stops at the end instead of
// repeating (so a 30s preview doesn't loop forever).
export function playOneOff(track) {
    setQueue([track]);
    oneOff = true;
    playAt(0);
}

export function isOneOff() { return oneOff; }

// The track the coordinator is actually on (playlist item OR one-off), so the
// now-playing label is correct in both modes.
export function currentTrack() { return index >= 0 ? queue[index] : null; }

export function playAt(i) {
    if (i < 0 || i >= queue.length) return;
    index = i;
    const url = queue[i].url;
    const engine = engines.find(e => e.matches(url)) || audio;
    _activate(engine);
    engine.play(url);
    onChange(index, queue[index]);
}

// Make `engine` the only audible/visible player: stop + hide all the others.
function _activate(engine) {
    for (const e of engines) {
        if (e !== engine) e.stop();
        e.setActive(e === engine);
    }
    active = engine;
}

// ---- transport (delegates to the active engine) ---------------------------
export function pause()  { if (active) active.pause(); }
export function resume() { if (active) active.resume(); }
export function isPlaying() { return active ? active.isPlaying() : false; }

export function stop() {
    for (const e of engines) e.stop();
    index = -1;
    oneOff = false;
    onChange(index, null);
}

export function next() {
    if (index + 1 < queue.length) playAt(index + 1);
    else if (oneOff) stop();                        // one-off ended → stop, don't loop
    else if (repeat && queue.length > 0) playAt(0);
}

export function prev() {
    if (index - 1 >= 0) playAt(index - 1);
}

export function playingIndex() { return index; }
