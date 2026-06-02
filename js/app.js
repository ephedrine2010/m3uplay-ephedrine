// ============================================================================
//  APP  —  ties together auth + Firestore + the built-in player + the UI.
//  Layout: playlists (left) | tracks (right) | player bar (bottom).
// ============================================================================

import { watchAuth, signIn, signOutUser } from "./auth.js";
import {
    listPlaylists, createPlaylist, savePlaylistTracks, deletePlaylist
} from "./firestore.js";
import { serializeM3U, nameFromUrl } from "./m3u.js";
import { initPlayer, setQueue, playAt, next, prev, playingIndex } from "./player.js";

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
            hide("#save-btn"); hide("#download-btn"); hide("#add-row");
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
    show("#save-btn"); show("#download-btn"); show("#add-row");
    setQueue(state.tracks);
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

        const playBtn = document.createElement("button");
        playBtn.className = "t-play" + (i === playing ? " is-playing" : "");
        playBtn.textContent = "▶";
        playBtn.title = "Play";
        playBtn.addEventListener("click", () => { playAt(i); renderTracks(); updateNowPlaying(); });

        const nameInput = document.createElement("input");
        nameInput.className = "t-name";
        nameInput.placeholder = "Name";
        nameInput.value = t.name || "";
        nameInput.addEventListener("input", () => { t.name = nameInput.value; });

        const urlInput = document.createElement("input");
        urlInput.className = "t-url";
        urlInput.placeholder = "https://…/song.mp3";
        urlInput.value = t.url || "";
        urlInput.addEventListener("input", () => { t.url = urlInput.value; setQueue(state.tracks); });

        const up = document.createElement("button");
        up.className = "t-btn"; up.textContent = "↑"; up.disabled = i === 0;
        up.addEventListener("click", () => moveTrack(i, -1));

        const down = document.createElement("button");
        down.className = "t-btn"; down.textContent = "↓"; down.disabled = i === state.tracks.length - 1;
        down.addEventListener("click", () => moveTrack(i, +1));

        const del = document.createElement("button");
        del.className = "t-btn danger"; del.textContent = "✕";
        del.addEventListener("click", () => { state.tracks.splice(i, 1); setQueue(state.tracks); renderTracks(); });

        li.append(playBtn, nameInput, urlInput, up, down, del);
        ul.appendChild(li);
    });
}

function moveTrack(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.tracks.length) return;
    [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
    setQueue(state.tracks);
    renderTracks();
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
});

$("#save-btn").addEventListener("click", async () => {
    if (!state.current) return;
    const cleaned = state.tracks
        .filter(t => (t.url || "").trim() !== "")
        .map(t => ({ name: (t.name || "").trim() || nameFromUrl(t.url), url: t.url.trim() }));
    setStatus("Saving…");
    try {
        await savePlaylistTracks(state.current.id, cleaned);
        state.tracks = cleaned;
        // keep local cache in sync
        const cached = state.playlists.find(p => p.id === state.current.id);
        if (cached) cached.tracks = cleaned;
        setQueue(state.tracks);
        renderTracks();
        setStatus("Saved ✓");
    } catch (e) {
        setStatus(e.message, true);
    }
});

// ---- download the current playlist as an .m3u file -------------------------
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
$("#prev-btn").addEventListener("click", () => { prev(); renderTracks(); updateNowPlaying(); });
$("#next-btn").addEventListener("click", () => { next(); renderTracks(); updateNowPlaying(); });
