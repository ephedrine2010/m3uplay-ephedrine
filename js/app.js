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
    initPlayer, setQueue, playAt, next, prev, playingIndex, setRepeat, getRepeat,
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

$("#create-btn").addEventListener("click", async () => {
    const name = ($("#new-name").value || "").trim();
    if (!name) { setStatus("Enter a playlist name.", true); return; }
    setStatus("Creating…");
    try {
        const id = await createPlaylist(state.uid, name);
        $("#new-name").value = "";
        await loadPlaylists();
        const pl = state.playlists.find(p => p.id === id);
        if (pl) selectPlaylist(pl);
    } catch (e) {
        setStatus(e.message, true);
    }
});

async function removePlaylist(pl) {
    if (!confirm(`Delete "${pl.name}"?`)) return;
    try {
        await deletePlaylist(pl.id);
        if (state.current && state.current.id === pl.id) {
            state.current = null;
            state.tracks = [];
            $("#content-title").textContent = "Select a playlist";
            hide("#play-all-btn"); hide("#save-btn"); hide("#download-btn"); hide("#add-row");
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
    $("#content-title").textContent = pl.name;
    show("#play-all-btn"); show("#save-btn"); show("#download-btn"); show("#add-row");
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
        del.className = "t-btn danger"; del.textContent = "✕";
        del.addEventListener("click", () => { state.tracks.splice(i, 1); setQueue(state.tracks); renderTracks(); scheduleSave(); });

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

$("#add-track-btn").addEventListener("click", () => {
    const url = ($("#add-url").value || "").trim();
    if (!url) { setStatus("Paste an mp3 link first.", true); return; }
    const name = ($("#add-name").value || "").trim() || nameFromUrl(url);
    state.tracks.push({ name, url });
    $("#add-name").value = "";
    $("#add-url").value = "";
    setQueue(state.tracks);
    renderTracks();
    scheduleSave();
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

$("#save-btn").addEventListener("click", () => persist(true));

// ---- download the current playlist as an .m3u file -------------------------
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

initPlayer($("#audio"), () => { renderTracks(); updateNowPlaying(); });

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
$("#prev-btn").addEventListener("click", () => { prev(); renderTracks(); updateNowPlaying(); });
$("#next-btn").addEventListener("click", () => { next(); renderTracks(); updateNowPlaying(); });

$("#repeat-btn").addEventListener("click", () => {
    const on = !getRepeat();
    setRepeat(on);
    $("#repeat-btn").classList.toggle("active", on);
    setStatus(on ? "Repeat on" : "Repeat off");
});

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
