// ============================================================================
//  PLAYER  —  a minimal built-in audio player.
//  Leans on the native <audio controls> element for play/pause/seek/volume,
//  and adds just the playlist glue: a queue, play-at-index, next/prev, and
//  auto-advance when a track ends. Reports the playing index via a callback.
// ============================================================================

let audioEl = null;
let queue = [];          // [{ name, url }]
let index = -1;          // currently playing index, -1 = nothing
let repeat = false;      // loop back to the first track after the last
let onChange = () => {}; // (index, track) => void

export function setRepeat(on) { repeat = !!on; }
export function getRepeat() { return repeat; }

export function initPlayer(audioElement, changeCb) {
    audioEl = audioElement;
    onChange = changeCb || (() => {});
    audioEl.addEventListener("ended", next); // auto-advance
}

// Replace the queue (does not start playback).
export function setQueue(tracks) {
    queue = (tracks || []).filter(t => (t.url || "").trim() !== "");
    if (index >= queue.length) index = -1;
}

export function playAt(i) {
    if (i < 0 || i >= queue.length) return;
    index = i;
    audioEl.src = queue[i].url;
    audioEl.play().catch(() => {}); // ignore autoplay rejections
    onChange(index, queue[index]);
}

export function pause() { if (audioEl) audioEl.pause(); }
export function resume() { if (audioEl) audioEl.play().catch(() => {}); }
export function isPlaying() { return !!audioEl && !audioEl.paused; }

// Stop playback entirely and clear the "now playing" state.
export function stop() {
    if (!audioEl) return;
    audioEl.pause();
    try { audioEl.currentTime = 0; } catch {}
    index = -1;
    onChange(index, null);
}

export function next() {
    if (index + 1 < queue.length) {
        playAt(index + 1);
    } else if (repeat && queue.length > 0) {
        playAt(0); // loop back to the start
    }
}

export function prev() {
    if (index - 1 >= 0) playAt(index - 1);
}

export function playingIndex() {
    return index;
}
