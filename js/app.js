// ============================================================================
//  APP  —  ties together auth + Firestore + the built-in player + the UI.
//  Layout: playlists (left) | tracks (right) | player bar (bottom).
// ============================================================================

import { watchAuth, signIn, signOutUser } from "./auth.js";
import {
    listPlaylists, createPlaylist, savePlaylistTracks, deletePlaylist
} from "./firestore.js";
import { serializeM3U, parseM3U, nameFromUrl } from "./m3u.js";
import {
    initPlayer, setQueue, playAt, playingIndex, setRepeat,
    pause, resume, isPlaying
} from "./player.js";

// ---- state -----------------------------------------------------------------
const state = {
    uid: null,
    playlists: [],   // [{ id, name, tracks }]
    current: null,   // selected playlist { id, name }
    tracks: []       // editable copy of current playlist's tracks
};

// ---- DOM helpers -----------------------------------------------------------
const $ = sel => document.querySelector(sel);
const show = sel => $(sel).classList.remove("hidden");
const hide = sel => $(sel).classList.add("hidden");

let statusTimer = null;
function setStatus(msg, isError = false) {
    const el = $("#status");
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => { el.textContent = ""; }, 3500);
}

// ============================================================================
//  AUTH
// ============================================================================
watchAuth(async (user) => {
    if (user) {
        state.uid = user.uid;
        $("#user-email").textContent = user.email;
        hide("#signin-box");
        show("#app");
        await loadPlaylists();
    } else {
        state.uid = null;
        state.playlists = [];
        state.current = null;
        state.tracks = [];
        show("#signin-box");
        hide("#app");
    }
});

$("#signin-btn").addEventListener("click", async () => {
    try { await signIn(); } catch (e) { setStatus(e.message, true); }
});
$("#signout-btn").addEventListener("click", () => signOutUser());

// ============================================================================
//  PLAYLISTS (left pane)
// ============================================================================
async function loadPlaylists() {
    setStatus("Loading playlists…");
    try {
        state.playlists = await listPlaylists(state.uid);
        renderPlaylists();
        setStatus("");
    } catch (e) {
        setStatus(e.message, true);
    }
}

function renderPlaylists() {
    const ul = $("#playlist-list");
    ul.innerHTML = "";
    if (state.playlists.length === 0) {
        ul.innerHTML = `<li class="empty">No playlists yet</li>`;
        return;
    }
    for (const pl of state.playlists) {
        const li = document.createElement("li");
        if (state.current && state.current.id === pl.id) li.classList.add("active");

        const name = document.createElement("span");
        name.className = "pl-name";
        name.textContent = pl.name;
        name.addEventListener("click", () => selectPlaylist(pl));

        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "✕";
        del.title = "Delete playlist";
        del.addEventListener("click", (e) => { e.stopPropagation(); removePlaylist(pl); });

        li.append(name, del);
        ul.appendChild(li);
    }
}

// ---- reusable confirm popup → returns a Promise<boolean> -------------------
const confirmModal = $("#confirm-modal");
let confirmResolve = null;
function askConfirm(message, okLabel = "Remove") {
    $("#confirm-text").textContent = message;
    $("#confirm-ok").textContent = okLabel;
    confirmModal.classList.remove("hidden");
    return new Promise(resolve => { confirmResolve = resolve; });
}
function resolveConfirm(value) {
    confirmModal.classList.add("hidden");
    if (confirmResolve) { confirmResolve(value); confirmResolve = null; }
}
$("#confirm-ok").addEventListener("click", () => resolveConfirm(true));
$("#confirm-cancel").addEventListener("click", () => resolveConfirm(false));
confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) resolveConfirm(false); });

// ---- New-playlist popup ----------------------------------------------------
const newPlModal = $("#new-pl-modal");
function openNewPlaylist() {
    newPlModal.classList.remove("hidden");
    const input = $("#new-name");
    input.value = "";
    input.focus();
}
function closeNewPlaylist() { newPlModal.classList.add("hidden"); }

async function createPlaylistFromModal() {
    const name = ($("#new-name").value || "").trim();
    if (!name) { setStatus("Enter a playlist name.", true); return; }
    setStatus("Creating…");
    try {
        const id = await createPlaylist(state.uid, name);
        closeNewPlaylist();
        await loadPlaylists();
        const pl = state.playlists.find(p => p.id === id);
        if (pl) selectPlaylist(pl);
    } catch (e) {
        setStatus(e.message, true);
    }
}

$("#new-pl-btn").addEventListener("click", openNewPlaylist);
$("#new-pl-cancel").addEventListener("click", closeNewPlaylist);
$("#new-pl-create").addEventListener("click", createPlaylistFromModal);
newPlModal.addEventListener("click", (e) => { if (e.target === newPlModal) closeNewPlaylist(); });
$("#new-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createPlaylistFromModal();
    else if (e.key === "Escape") closeNewPlaylist();
});

async function removePlaylist(pl) {
    if (!await askConfirm(`Delete playlist "${pl.name}"?`, "Delete")) return;
    try {
        await deletePlaylist(pl.id);
        if (state.current && state.current.id === pl.id) {
            state.current = null;
            state.tracks = [];
            hide("#play-all-btn"); hide("#add-song-btn"); hide("#download-btn");
            renderTracks();
        }
        await loadPlaylists();
    } catch (e) {
        setStatus(e.message, true);
    }
}

// ============================================================================
//  TRACKS (right pane)
// ============================================================================
function selectPlaylist(pl) {
    state.current = { id: pl.id, name: pl.name };
    state.tracks = (pl.tracks || []).map(t => ({ name: t.name || "", url: t.url || "" }));
    show("#play-all-btn"); show("#add-song-btn"); show("#download-btn");
    setQueue(state.tracks);
    updatePlayAllBtn();
    renderPlaylists();   // refresh active highlight
    renderTracks();
}

function renderTracks() {
    const ul = $("#track-list");
    ul.innerHTML = "";
    if (!state.current) {
        ul.innerHTML = `<li class="empty">Pick a playlist on the left</li>`;
        return;
    }
    if (state.tracks.length === 0) {
        ul.innerHTML = `<li class="empty">No tracks yet — add one below</li>`;
        return;
    }
    const playing = playingIndex();
    state.tracks.forEach((t, i) => {
        const li = document.createElement("li");
        if (i === playing) li.classList.add("playing");

        const isCurrent = i === playing;
        const playingNow = isCurrent && isPlaying();

        const playBtn = document.createElement("button");
        playBtn.className = "t-play" + (isCurrent ? " is-playing" : "");
        playBtn.textContent = playingNow ? "⏸" : "▶";
        playBtn.title = playingNow ? "Pause" : "Play";
        playBtn.addEventListener("click", () => toggleTrack(i));

        // Read-only track name (URL is hidden, kept in data). Tap to play/pause.
        const nameEl = document.createElement("span");
        nameEl.className = "t-name-text";
        nameEl.textContent = t.name || nameFromUrl(t.url);
        nameEl.title = t.url || "";
        nameEl.addEventListener("click", () => toggleTrack(i));

        const up = document.createElement("button");
        up.className = "t-btn"; up.textContent = "↑"; up.disabled = i === 0;
        up.addEventListener("click", () => moveTrack(i, -1));

        const down = document.createElement("button");
        down.className = "t-btn"; down.textContent = "↓"; down.disabled = i === state.tracks.length - 1;
        down.addEventListener("click", () => moveTrack(i, +1));

        const del = document.createElement("button");
        del.className = "del"; del.textContent = "✕"; del.title = "Remove";
        del.addEventListener("click", async () => {
            const ok = await askConfirm(`Remove "${t.name || nameFromUrl(t.url)}"?`);
            if (!ok) return;
            state.tracks.splice(i, 1);
            setQueue(state.tracks);
            renderTracks();
            scheduleSave();
        });

        li.append(playBtn, nameEl, up, down, del);
        ul.appendChild(li);
    });
}

function moveTrack(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.tracks.length) return;
    [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
    setQueue(state.tracks);
    renderTracks();
    scheduleSave();
}

// ---- Add-song popup --------------------------------------------------------
const addModal = $("#add-song-modal");
function openAddSong() {
    if (!state.current) return;
    addModal.classList.remove("hidden");
    $("#add-url").value = "";
    $("#add-name").value = "";
    $("#add-url").focus();
}
function closeAddSong() { addModal.classList.add("hidden"); }

// Adds the song and keeps the popup open (clears fields) so you can add several.
function addCurrentSong() {
    const url = ($("#add-url").value || "").trim();
    if (!url) { setStatus("Paste an audio or SoundCloud link.", true); return; }
    const name = ($("#add-name").value || "").trim() || nameFromUrl(url);
    state.tracks.push({ name, url });
    $("#add-name").value = "";
    $("#add-url").value = "";
    setQueue(state.tracks);
    renderTracks();
    scheduleSave();
    setStatus("Added ✓");
    $("#add-url").focus();
}

$("#add-song-btn").addEventListener("click", openAddSong);
$("#add-song-done").addEventListener("click", closeAddSong);
$("#add-track-btn").addEventListener("click", addCurrentSong);
addModal.addEventListener("click", (e) => { if (e.target === addModal) closeAddSong(); });

// Enter adds, Esc closes — from either field.
["#add-url", "#add-name"].forEach(sel => {
    $(sel).addEventListener("keydown", (e) => {
        if (e.key === "Enter") addCurrentSong();
        else if (e.key === "Escape") closeAddSong();
    });
});

// Auto-fill the name box from the URL as you paste/type (until you type a name).
$("#add-url").addEventListener("input", () => {
    const url = ($("#add-url").value || "").trim();
    const nameField = $("#add-name");
    if (url && !nameField.value.trim()) nameField.value = nameFromUrl(url);
});

// ---- saving: shared persist used by both auto-save and the Save button ----
let saveTimer = null;

function cleanTracks() {
    return state.tracks
        .filter(t => (t.url || "").trim() !== "")
        .map(t => ({ name: (t.name || "").trim() || nameFromUrl(t.url), url: t.url.trim() }));
}

// Debounced auto-save — fires ~1s after the last edit. Does NOT re-render, so
// it won't disrupt the field you're typing in.
function scheduleSave() {
    if (!state.current) return;
    clearTimeout(saveTimer);
    setStatus("Saving…");
    saveTimer = setTimeout(() => persist(false), 1000);
}

async function persist(reRender) {
    if (!state.current) return;
    clearTimeout(saveTimer);
    const cleaned = cleanTracks();
    try {
        await savePlaylistTracks(state.current.id, cleaned);
        const cached = state.playlists.find(p => p.id === state.current.id);
        if (cached) cached.tracks = cleaned;
        if (reRender) { state.tracks = cleaned; setQueue(state.tracks); renderTracks(); }
        setStatus("Saved ✓");
    } catch (e) {
        setStatus(e.message, true);
    }
}

// ---- Play all / Stop / Continue (one toggle button) ------------------------
// Idle  → "▶ Play all"  (plays from the top)
// Playing → "⏹ Stop"    (pauses, so it can resume)
// Paused → "▶ Continue" (resumes where it left off)
function updatePlayAllBtn() {
    const btn = $("#play-all-btn");
    if (!btn) return;
    if (isPlaying()) {
        btn.textContent = "⏹ Stop";
    } else if (playingIndex() >= 0) {
        btn.textContent = "▶ Continue";
    } else {
        btn.textContent = "▶ Play all";
    }
}

$("#play-all-btn").addEventListener("click", () => {
    if (!state.current) return;
    if (isPlaying()) {
        pause();
    } else if (playingIndex() >= 0) {
        resume();
    } else {
        setQueue(state.tracks);
        if (state.tracks.every(t => !(t.url || "").trim())) {
            setStatus("No playable tracks.", true);
            return;
        }
        playAt(0);
    }
    updatePlayAllBtn();
    renderTracks();
    updateNowPlaying();
});

$("#download-btn").addEventListener("click", () => {
    if (!state.current) return;
    const text = serializeM3U(state.tracks.filter(t => (t.url || "").trim() !== ""));
    const blob = new Blob([text], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.current.name.toLowerCase().endsWith(".m3u")
        ? state.current.name
        : `${state.current.name}.m3u`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

// ============================================================================
//  PLAYER (bottom bar)
// ============================================================================
function updateNowPlaying() {
    const i = playingIndex();
    const t = i >= 0 ? state.tracks[i] : null;
    $("#now-playing").textContent = t ? (t.name || nameFromUrl(t.url)) : "Nothing playing";
}

initPlayer($("#audio"), $("#sc-widget"), reflectPlayState);
setRepeat(true); // looping is always on (no toggle)

// Tap a track: play it, or pause/resume if it's already the current one.
function toggleTrack(i) {
    if (i === playingIndex()) {
        if (isPlaying()) pause(); else resume();
    } else {
        playAt(i);
    }
    renderTracks();
    updateNowPlaying();
}

// Keep the equalizer + row icons in sync with the real play/pause state
// (covers pausing via the native audio controls too).
const audioEl = $("#audio");
const viz = $("#viz");
function reflectPlayState() {
    viz.classList.toggle("playing", isPlaying());
    updatePlayAllBtn();
    renderTracks();
    updateNowPlaying();
}
audioEl.addEventListener("play", reflectPlayState);
audioEl.addEventListener("pause", reflectPlayState);
audioEl.addEventListener("ended", reflectPlayState);

// ============================================================================
//  IMPORT  —  upload an .m3u file → parse → create a new playlist from it
// ============================================================================
$("#import-btn").addEventListener("click", () => $("#import-file").click());

$("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("Importing…");
    try {
        const text = await file.text();
        const tracks = parseM3U(text)
            .filter(t => (t.url || "").trim() !== "")
            .map(t => ({ name: (t.name || "").trim() || nameFromUrl(t.url), url: t.url.trim() }));
        const name = file.name.replace(/\.(m3u8?)$/i, "").trim() || "Imported";
        const id = await createPlaylist(state.uid, name, tracks);
        await loadPlaylists();
        const pl = state.playlists.find(p => p.id === id);
        if (pl) selectPlaylist(pl);
        setStatus(`Imported "${name}" — ${tracks.length} track(s) ✓`);
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        e.target.value = ""; // allow re-importing the same file
    }
});
