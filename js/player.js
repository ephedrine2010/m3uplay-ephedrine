// ============================================================================
//  PLAYER  —  a minimal built-in audio player.
//  Leans on the native <audio controls> element for play/pause/seek/volume,
//  and adds just the playlist glue: a queue, play-at-index, next/prev, and
//  auto-advance when a track ends. Reports the playing index via a callback.
// ============================================================================

let audioEl = null;
let queue = [];          // [{ name, url }]
let index = -1;          // currently playing index, -1 = nothing
let onChange = () => {}; // (index, track) => void

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

export function next() {
    if (index + 1 < queue.length) playAt(index + 1);
}

export function prev() {
    if (index - 1 >= 0) playAt(index - 1);
}

export function playingIndex() {
    return index;
}
