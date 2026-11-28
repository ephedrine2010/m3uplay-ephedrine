// ============================================================================
//  APP  —  ties together auth + Firestore + the built-in player + the UI.
//  Layout: playlists (left) | tracks (right) | player bar (bottom).
// ============================================================================

import { watchAuth, signIn, signOutUser } from "./auth.js";
import {
    listPlaylists, createPlaylist, savePlaylistTracks, deletePlaylist
} from "./firestore.js";
import { serializeM3U, parseM3U, nameFromUrl, extractUrl, youTubeId } from "./m3u.js";
import {
    initPlayer, setQueue, playAt, playingIndex, setRepeat,
    pause, resume, isPlaying, playOneOff, isOneOff, currentTrack, stop, setYouTubeHost
} from "./player.js";
import { initTrendsBoard } from "./trends_board/index.js";
import { fetchPreview } from "./trends_board/deezer.js";
import { initYouTubeChannels } from "./yt-channels/index.js";
import { createYouTubeApi } from "./yt-channels/api.js";
import { youtubeChannelsConfig } from "./yt-channels/config.js";
import { listChannels, saveChannel, deleteChannel, saveChannelOrder, saveChannelCollapsed } from "./yt-channels/storage.js";
import { arrangeChannels } from "./yt-channels/preferences.js";
import { createPlaylistImportDialog } from "./yt-playlists/dialog.js";
import { icon, iconText } from "./icons.js";
import { initUI, closeLibrary } from "./ui.js";

initUI();

// ---- state -----------------------------------------------------------------
const state = {
    uid: null,
    playlists: [],   // [{ id, name, tracks }]
    current: null,   // selected playlist { id, name }
    tracks: [],      // editable copy of current playlist's tracks
    channels: [],
    channelFeeds: {},
    channelsLoading: false,
    channelsError: "",
    channelPreferencesSaving: false,
    channelVideo: null,
    playlistVideo: null,
    playlistReturnIndex: null,
    channelPlaybackError: ""
};
const channelApi = createYouTubeApi(youtubeChannelsConfig);
let channelView = null;
let channelRequest = null;
let removingChannel = false;
let playlistImport = null;

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
        if (state.uid !== user.uid) {
            channelRequest?.abort();
            channelApi.clearCache();
            closeChannelPlayer();
            channelView?.closeDialog();
            playlistImport?.close();
            clearTimeout(saveTimer);
            saveTimer = null;
            stop();
            state.playlists = [];
            state.current = null;
            state.tracks = [];
            renderPlaylists();
            state.channels = [];
            state.channelFeeds = {};
            state.channelPreferencesSaving = false;
        }
        state.uid = user.uid;
        $("#user-email").textContent = user.email;
        $("#user-email").title = user.email || "";
        $("#account-avatar").textContent = (user.displayName || user.email || "M").slice(0, 1).toUpperCase();
        hide("#signin-box");
        show("#app");
        showBoard(); // show loading states without waiting for channel API calls
        await Promise.all([loadPlaylists(), loadYouTubeChannels(user.uid)]);
    } else {
        state.uid = null;
        state.playlists = [];
        state.current = null;
        state.tracks = [];
        channelRequest?.abort();
        channelApi.clearCache();
        state.channels = [];
        state.channelFeeds = {};
        state.channelsError = "";
        state.channelsLoading = false;
        state.channelPreferencesSaving = false;
        closeChannelPlayer();
        stop();
        channelView?.closeDialog();
        playlistImport?.close();
        clearTimeout(saveTimer);
        saveTimer = null;
        renderYouTubeChannels();
        resolveConfirm(false);
        closeLibrary();
        closeNewPlaylist(); closeAddSong();
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
    const uid = state.uid;
    setStatus("Loading playlists…");
    try {
        const playlists = await listPlaylists(uid);
        if (state.uid !== uid) return;
        state.playlists = playlists;
        renderPlaylists();
        setStatus("");
    } catch (e) {
        if (state.uid === uid) setStatus(e.message, true);
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

        const name = document.createElement("button");
        name.type = "button";
        name.className = "pl-name";
        iconText(name, pl.source === "youtube" ? "play" : "list", pl.name);
        if (state.current?.id === pl.id) name.setAttribute("aria-current", "page");
        name.addEventListener("click", () => selectPlaylist(pl));

        const del = document.createElement("button");
        del.className = "del";
        del.append(icon("x"));
        del.title = "Delete playlist";
        del.setAttribute("aria-label", `Delete playlist ${pl.name}`);
        del.addEventListener("click", (e) => { e.stopPropagation(); removePlaylist(pl); });

        li.append(name, del);
        ul.appendChild(li);
    }
}

// ---- reusable confirm popup → returns a Promise<boolean> -------------------
const confirmModal = $("#confirm-modal");
let confirmResolve = null;
function askConfirm(message, okLabel = "Remove") {
    if (confirmResolve) resolveConfirm(false);
    $("#confirm-text").textContent = message;
    $("#confirm-ok").textContent = okLabel;
    confirmModal.showModal();
    $("#confirm-cancel").focus();
    return new Promise(resolve => { confirmResolve = resolve; });
}
function resolveConfirm(value) {
    if (confirmModal.open) confirmModal.close();
    if (confirmResolve) { confirmResolve(value); confirmResolve = null; }
}
$("#confirm-ok").addEventListener("click", () => resolveConfirm(true));
$("#confirm-cancel").addEventListener("click", () => resolveConfirm(false));
confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) resolveConfirm(false); });
confirmModal.addEventListener("cancel", (e) => { e.preventDefault(); resolveConfirm(false); });
confirmModal.addEventListener("close", () => { if (!confirmModal.open && confirmResolve) resolveConfirm(false); });

// ---- New-playlist popup ----------------------------------------------------
const newPlModal = $("#new-pl-modal");
const playlistMenu = $("#playlist-add-menu");
function closePlaylistMenu(restoreFocus = false) {
    playlistMenu.hidden = true;
    $("#new-pl-btn").setAttribute("aria-expanded", "false");
    if (restoreFocus) $("#new-pl-btn").focus();
}
$("#new-pl-btn").addEventListener("click", () => {
    playlistMenu.hidden = !playlistMenu.hidden;
    $("#new-pl-btn").setAttribute("aria-expanded", String(!playlistMenu.hidden));
    if (!playlistMenu.hidden) playlistMenu.querySelector("button").focus();
});
playlistMenu.addEventListener("click", () => closePlaylistMenu());
document.addEventListener("click", event => {
    if (!$("#sidebar-head").contains(event.target)) closePlaylistMenu();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !playlistMenu.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePlaylistMenu(true);
    }
}, true);
function openNewPlaylist() {
    newPlModal.showModal();
    const input = $("#new-name");
    input.value = "";
    input.focus();
}
function closeNewPlaylist() { if (newPlModal.open) newPlModal.close(); }

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

$("#new-empty-pl-btn").addEventListener("click", openNewPlaylist);
$("#new-pl-cancel").addEventListener("click", closeNewPlaylist);
$("#new-pl-create").addEventListener("click", createPlaylistFromModal);
newPlModal.addEventListener("click", (e) => { if (e.target === newPlModal) closeNewPlaylist(); });
$("#new-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createPlaylistFromModal();
    else if (e.key === "Escape") closeNewPlaylist();
});

playlistImport = createPlaylistImportDialog({
    mount: document.body,
    resolvePlaylist: channelApi.resolvePlaylist,
    onImport: async playlist => {
        const uid = state.uid;
        if (!uid) throw new Error("Sign in before importing a playlist.");
        let id;
        try {
            id = await createPlaylist(uid, playlist.title, playlist.tracks, {
                source: "youtube", sourceUrl: playlist.url, youtubePlaylistId: playlist.playlistId
            });
        } catch { throw new Error("Couldn't save this playlist. Please try again."); }
        if (state.uid !== uid) return;
        const saved = { id, name: playlist.title, tracks: playlist.tracks, source: "youtube", sourceUrl: playlist.url, youtubePlaylistId: playlist.playlistId };
        state.playlists.push(saved);
        state.playlists.sort((a, b) => a.name.localeCompare(b.name));
        selectPlaylist(saved);
        setStatus(`Imported ${playlist.tracks.length} videos`);
    }
});
$("#add-yt-playlist-btn").addEventListener("click", () => playlistImport.open());

async function removePlaylist(pl) {
    if (!await askConfirm(`Delete playlist "${pl.name}"?`, "Delete")) return;
    try {
        await deletePlaylist(pl.id);
        if (state.current && state.current.id === pl.id) {
            clearTimeout(saveTimer);
            saveTimer = null;
            closeChannelPlayer();
            stop();
            state.current = null;
            state.tracks = [];
            hide("#play-all-btn"); hide("#add-song-btn"); hide("#download-btn");
            renderTracks();
            showBoard();   // deleted the open playlist → back to discovery
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
    flushPendingSave();
    closeChannelPlayer();
    stop();
    state.current = { id: pl.id, name: pl.name, source: pl.source || "" };
    state.tracks = (pl.tracks || []).map(t => ({ ...t, name: t.name || "", url: t.url || "" }));
    show("#play-all-btn"); show("#add-song-btn"); show("#download-btn");
    setQueue(state.tracks);
    updatePlayAllBtn();
    renderPlaylists();   // refresh active highlight
    renderTracks();
    showTracks();        // swap the discovery board out for this playlist
}

function renderTracks() {
    const ul = $("#track-list");
    const active = ul.contains(document.activeElement) ? document.activeElement : null;
    const focused = active ? { index: active.closest("li")?.dataset.trackIndex, action: active.dataset.action } : null;
    ul.innerHTML = "";
    const gallery = state.current?.source === "youtube";
    ul.classList.toggle("playlist-grid", gallery);
    $("#playlist-info").textContent = state.current ? `${state.tracks.length} tracks${gallery ? " · Imported from YouTube · Editable copy" : ""}` : "";
    if (!state.current) {
        ul.innerHTML = `<li class="empty">Pick a playlist on the left</li>`;
        return;
    }
    if (state.tracks.length === 0) {
        ul.innerHTML = `<li class="empty">No tracks yet. Use Add track to get started.</li>`;
        return;
    }
    const playing = playingIndex();
    state.tracks.forEach((t, i) => {
        const li = document.createElement("li");
        li.dataset.trackIndex = i;
        if (i === playing) li.classList.add("playing");

        const isCurrent = i === playing;
        const playingNow = isCurrent && isPlaying();

        const playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.dataset.action = "play";
        playBtn.className = "t-play t-art" + (isCurrent ? " is-playing" : "");
        const videoId = youTubeId(t.url);
        const validVideoId = /^[\w-]{11}$/.test(videoId || "");
        const artwork = /^https:\/\//i.test(t.thumb || "") ? t.thumb : validVideoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : "";
        const fallback = icon("music");
        fallback.classList.add("t-art-fallback");
        playBtn.append(fallback);
        if (artwork) {
            const image = document.createElement("img");
            image.src = artwork; image.alt = ""; image.loading = "lazy";
            image.addEventListener("error", () => image.remove(), { once: true });
            playBtn.append(image);
        }
        const badge = document.createElement("span");
        badge.className = "t-play-badge";
        iconText(badge, playingNow ? "pause" : "play", isCurrent ? (playingNow ? "Playing" : "Paused") : "");
        playBtn.append(badge);
        playBtn.title = playingNow ? "Pause" : "Play";
        playBtn.setAttribute("aria-label", `${playingNow ? "Pause" : "Play"} ${t.name || nameFromUrl(t.url)}`);
        playBtn.addEventListener("click", () => toggleTrack(i));

        // Read-only track name (URL is hidden, kept in data). Tap to play/pause.
        const nameEl = document.createElement("button");
        nameEl.type = "button";
        nameEl.dataset.action = "name";
        nameEl.className = "t-name-text";
        const title = document.createElement("strong");
        title.textContent = t.name || nameFromUrl(t.url);
        const source = document.createElement("span");
        source.className = "t-source";
        source.textContent = t.channelTitle || (validVideoId ? "YouTube" : /soundcloud\.com\//i.test(t.url) ? "SoundCloud" : "Audio");
        nameEl.append(title, source);
        nameEl.title = t.url || "";
        nameEl.addEventListener("click", () => toggleTrack(i));

        const up = document.createElement("button");
        up.className = "t-btn"; up.append(icon("up")); up.disabled = i === 0;
        up.dataset.action = "up";
        up.title = "Move up"; up.setAttribute("aria-label", `Move ${t.name || "track"} up`);
        up.addEventListener("click", () => moveTrack(i, -1));

        const down = document.createElement("button");
        down.className = "t-btn"; down.append(icon("down")); down.disabled = i === state.tracks.length - 1;
        down.dataset.action = "down";
        down.title = "Move down"; down.setAttribute("aria-label", `Move ${t.name || "track"} down`);
        down.addEventListener("click", () => moveTrack(i, +1));

        const del = document.createElement("button");
        del.className = "del"; del.append(icon("x")); del.title = "Remove";
        del.dataset.action = "remove";
        del.setAttribute("aria-label", `Remove ${t.name || "track"}`);
        del.addEventListener("click", async () => {
            const ok = await askConfirm(`Remove "${t.name || nameFromUrl(t.url)}"?`);
            if (!ok) return;
            closeChannelPlayer();
            stop();
            state.tracks.splice(i, 1);
            setQueue(state.tracks);
            renderTracks();
            scheduleSave();
        });

        li.append(playBtn, nameEl, up, down, del);
        ul.appendChild(li);
    });
    if (focused?.index != null && focused.action) {
        ul.querySelector(`[data-track-index="${focused.index}"] [data-action="${focused.action}"]`)?.focus({ preventScroll: true });
    }
}

function moveTrack(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.tracks.length) return;
    closeChannelPlayer();
    stop();
    [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
    setQueue(state.tracks);
    renderTracks();
    scheduleSave();
}

// ---- Add-song popup --------------------------------------------------------
const addModal = $("#add-song-modal");
function openAddSong() {
    if (!state.current) return;
    addModal.showModal();
    $("#add-url").value = "";
    $("#add-name").value = "";
    $("#add-url").focus();
}
function closeAddSong() { if (addModal.open) addModal.close(); }

// Adds the song and keeps the popup open (clears fields) so you can add several.
function addCurrentSong() {
    // Accept a pasted share message (e.g. Anghami's "♫ … https://…"), not just a
    // bare URL — extractUrl pulls the link out of any surrounding text.
    const url = extractUrl($("#add-url").value || "");
    if (!url) { setStatus("Paste an audio, SoundCloud or YouTube link.", true); return; }
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
    const url = extractUrl($("#add-url").value || "");
    const nameField = $("#add-name");
    if (url && !nameField.value.trim()) nameField.value = nameFromUrl(url);
});

// ---- saving: shared persist used by both auto-save and the Save button ----
let saveTimer = null;

function cleanTracks() {
    return state.tracks
        .filter(t => (t.url || "").trim() !== "")
        .map(t => ({
            name: (t.name || "").trim() || nameFromUrl(t.url), url: t.url.trim(),
            ...(t.thumb ? { thumb: t.thumb } : {}),
            ...(t.channelTitle ? { channelTitle: t.channelTitle } : {})
        }));
}

function flushPendingSave() {
    if (saveTimer) void persist(false);
}

// Debounced auto-save — fires ~1s after the last edit. Does NOT re-render, so
// it won't disrupt the field you're typing in.
function scheduleSave() {
    if (!state.current) return;
    clearTimeout(saveTimer);
    const cached = state.playlists.find(item => item.id === state.current.id);
    if (cached) cached.tracks = cleanTracks();
    setStatus("Saving…");
    saveTimer = setTimeout(() => persist(false), 1000);
}

async function persist(reRender) {
    if (!state.current) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const id = state.current.id;
    const uid = state.uid;
    const cleaned = cleanTracks();
    const cached = state.playlists.find(item => item.id === id);
    if (cached) cached.tracks = cleaned;
    try {
        await savePlaylistTracks(id, cleaned);
        if (state.uid !== uid) return;
        if (reRender && state.current?.id === id) { state.tracks = cleaned; setQueue(state.tracks); renderTracks(); }
        setStatus("Saved ✓");
    } catch (e) {
        if (state.uid === uid) setStatus(e.message, true);
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
        iconText(btn, "pause", "Pause");
    } else if (playingIndex() >= 0) {
        iconText(btn, "play", "Continue");
    } else {
        iconText(btn, "play", "Play all");
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
    // Use the coordinator's actual current track so the label is right for both
    // playlist tracks and one-off trends-board plays.
    const t = currentTrack();
    $("#now-playing").textContent = t ? (t.name || nameFromUrl(t.url)) : "Nothing playing";
}

initPlayer($("#audio"), $("#sc-widget"), $("#yt-widget"), reflectPlayState, (msg) => setStatus(msg), (error) => {
    if (state.channelVideo && error.track?.videoId === state.channelVideo.videoId) {
        state.channelPlaybackError = error.message;
        renderYouTubeChannels();
    }
}, prepareTrackPlayback);
setRepeat(true); // looping is always on (no toggle)

// ============================================================================
//  DISCOVERY — personal channels above the daily trends, one scroll container.
// ============================================================================
const discoveryHome = document.createElement("div");
discoveryHome.id = "discovery-home";
discoveryHome.className = "hidden";
$("#content").append(discoveryHome);
channelView = initYouTubeChannels({
    mount: discoveryHome,
    controls: $("#home-actions"),
    deps: {
        resolveChannel: channelApi.resolveChannel,
        exists: id => state.channels.some(channel => channel.channelId === id),
        onAdd: addYouTubeChannel,
        onRemove: removeYouTubeChannel,
        onReorder: reorderYouTubeChannels,
        onMove: moveYouTubeChannel,
        onCollapse: collapseYouTubeChannel,
        onRefresh: channel => refreshChannelFeed(channel, { force: true }),
        onRetry: () => loadYouTubeChannels(state.uid),
        onPlay: playChannelVideo,
        onToggle: toggleChannelPlayback,
        onClosePlayer: closeChannelPlayer
    }
});
const trendsBoard = initTrendsBoard({
    mount: discoveryHome,
    deps: {
        player: { playOneOff: track => { closeChannelPlayer(); playOneOff(track); } },
        resolvePreview: fetchPreview,   // fresh Deezer preview URL at click-time
        openExternal: (url, label) => {
            if (!url) { setStatus("No link for this item.", true); return; }
            window.open(url, "_blank", "noopener");
            setStatus(`Opening ${label} ↗`);
        },
        notify: (msg) => setStatus(msg)
    }
});

function showBoard() {
    hide("#playlist-info");
    $("#page-title").textContent = "Home";
    $("#home-btn").setAttribute("aria-current", "page");
    show("#home-actions");
    closeLibrary();
    hide("#track-list");
    discoveryHome.classList.remove("hidden");
    trendsBoard.show();
}
function showTracks() {
    show("#playlist-info");
    $("#page-title").textContent = state.current?.name || "Playlist";
    $("#home-btn").removeAttribute("aria-current");
    hide("#home-actions");
    closeLibrary();
    channelView.cancelDrag();
    discoveryHome.classList.add("hidden");
    trendsBoard.hide();
    show("#track-list");
}

function renderYouTubeChannels() {
    channelView?.render({
        channels: state.channels, feeds: state.channelFeeds,
        loading: state.channelsLoading, error: state.channelsError,
        preferencesSaving: state.channelPreferencesSaving,
        configured: !!youtubeChannelsConfig.apiKey.trim(),
        video: state.playlistVideo || state.channelVideo, playing: isPlaying(), playbackError: state.channelPlaybackError
    });
}

async function loadYouTubeChannels(uid) {
    if (!uid) return;
    channelRequest?.abort();
    const request = channelRequest = new AbortController();
    state.channelsLoading = true;
    state.channelsError = "";
    renderYouTubeChannels();
    try {
        const channels = await listChannels(uid);
        if (request.signal.aborted || state.uid !== uid) return;
        state.channels = channels;
        state.channelFeeds = {};
        state.channelsLoading = false;
        renderYouTubeChannels();
        await Promise.allSettled(channels.map(channel => refreshChannelFeed(channel)));
    } catch (error) {
        if (request.signal.aborted || state.uid !== uid) return;
        state.channelsLoading = false;
        state.channelsError = "Couldn't load your saved channels. Please try again.";
        renderYouTubeChannels();
    }
}

async function refreshChannelFeed(channel, { force = false } = {}) {
    const uid = state.uid;
    const signal = channelRequest?.signal;
    if (!uid || signal?.aborted) return;
    state.channelFeeds[channel.channelId] = { loading: true, videos: [], error: "" };
    renderYouTubeChannels();
    try {
        const videos = await channelApi.recentVideos(channel, { force, signal });
        if (signal?.aborted || state.uid !== uid || !state.channels.some(c => c.channelId === channel.channelId)) return;
        state.channelFeeds[channel.channelId] = { loading: false, videos, error: "" };
    } catch (error) {
        if (signal?.aborted || state.uid !== uid || !state.channels.some(c => c.channelId === channel.channelId)) return;
        state.channelFeeds[channel.channelId] = { loading: false, videos: [], error: error.message };
    }
    renderYouTubeChannels();
}

async function addYouTubeChannel(channel) {
    const uid = state.uid;
    if (!uid) throw new Error("Sign in to add a channel.");
    if (state.channelPreferencesSaving) throw new Error("Wait for the channel layout to finish saving.");
    if (state.channels.some(c => c.channelId === channel.channelId)) throw new Error("This channel is already on your page.");
    let saved;
    const position = Math.min(0, ...state.channels.map(item => Number.isFinite(item.position) ? item.position : 0)) - 1;
    try { saved = await saveChannel(uid, { ...channel, position }); }
    catch { throw new Error("Couldn't save the channel. Please try again."); }
    if (state.uid !== uid) return;
    state.channels.unshift(saved);
    renderYouTubeChannels();
    setStatus(`Added ${channel.title}`);
    // Saving closes the dialog immediately; feeds show their own loading state.
    void refreshChannelFeed(saved);
}

async function removeYouTubeChannel(channel) {
    if (removingChannel || state.channelPreferencesSaving) return;
    removingChannel = true;
    const uid = state.uid;
    try {
        if (!await askConfirm(`Remove "${channel.title}" from your page? You can add it again anytime.`)) return;
        if (state.uid !== uid) return;
        await deleteChannel(channel.id);
        if (state.uid !== uid) return;
        if (state.channelVideo?.channelId === channel.channelId) closeChannelPlayer();
        state.channels = state.channels.filter(c => c.channelId !== channel.channelId);
        delete state.channelFeeds[channel.channelId];
        renderYouTubeChannels();
        setStatus("Channel removed");
        channelView.focusAdd();
    } catch { setStatus("Couldn't remove the channel. Please try again.", true); }
    finally { removingChannel = false; }
}

async function persistChannelLayout(channels, save, focusId, focusSelector, successMessage) {
    if (!state.uid || state.channelsLoading || state.channelPreferencesSaving || removingChannel) return;
    const uid = state.uid;
    const request = channelRequest;
    const sameSession = () => state.uid === uid && channelRequest === request && !request?.signal.aborted;
    const previous = state.channels;
    state.channels = channels;
    state.channelPreferencesSaving = true;
    renderYouTubeChannels();
    try {
        await save();
        if (sameSession()) setStatus(successMessage);
    } catch {
        if (sameSession()) {
            state.channels = previous;
            setStatus("Couldn't save the channel layout. Your previous layout was restored.", true);
        }
    } finally {
        if (sameSession()) {
            state.channelPreferencesSaving = false;
            renderYouTubeChannels();
            channelView.focusChannel(focusId, focusSelector);
        }
    }
}

async function reorderYouTubeChannels(ids, focusId) {
    if (ids.every((id, index) => id === state.channels[index]?.channelId) && ids.length === state.channels.length) return;
    let channels;
    try { channels = arrangeChannels(state.channels, ids); }
    catch (error) { setStatus(error.message, true); renderYouTubeChannels(); return; }
    await persistChannelLayout(channels, () => saveChannelOrder(channels), focusId, ".yc-drag-handle", "Channel order saved");
}

function moveYouTubeChannel(channel, direction) {
    const ids = state.channels.map(item => item.channelId);
    const from = ids.indexOf(channel.channelId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return reorderYouTubeChannels(ids, channel.channelId);
}

function collapseYouTubeChannel(channel) {
    const current = state.channels.find(item => item.channelId === channel.channelId);
    if (!current) return;
    const collapsed = !current.collapsed;
    const channels = state.channels.map(item => item.channelId === channel.channelId ? { ...item, collapsed } : item);
    return persistChannelLayout(channels, () => saveChannelCollapsed(channel.id, collapsed), channel.channelId,
        ".yc-collapse", collapsed ? "Channel collapsed" : "Channel expanded");
}

function playChannelVideo(video) {
    state.playlistVideo = null;
    state.channelVideo = video;
    state.channelPlaybackError = "";
    setYouTubeHost(channelView.playerSlot);
    renderYouTubeChannels();
    playOneOff({ name: `${video.title} — ${video.channelTitle}`, url: video.url, videoId: video.videoId });
}

function closeChannelPlayer() {
    if (!state.channelVideo && !state.playlistVideo) return;
    const returnIndex = state.playlistReturnIndex;
    state.channelVideo = null;
    state.playlistVideo = null;
    state.playlistReturnIndex = null;
    state.channelPlaybackError = "";
    stop();
    setYouTubeHost($("#player-bar"));
    $("#yt-widget").hidden = true;
    renderYouTubeChannels();
    if (returnIndex != null) $("#track-list").querySelector(`[data-track-index="${returnIndex}"] .t-play`)?.focus({ preventScroll: true });
}

function toggleChannelPlayback() {
    if (state.playlistVideo) {
        if (isPlaying()) pause(); else resume();
        reflectPlayState();
        return;
    }
    if (!state.channelVideo) return;
    if (!currentTrack() || state.channelPlaybackError) playChannelVideo(state.channelVideo);
    else if (isPlaying()) pause();
    else resume();
    reflectPlayState();
}

$("#brand").addEventListener("click", () => {
    flushPendingSave();
    closeChannelPlayer();
    stop();
    state.current = null;
    hide("#play-all-btn"); hide("#add-song-btn"); hide("#download-btn");
    renderPlaylists();   // clear the active highlight
    showBoard();
});
$("#home-btn").addEventListener("click", () => $("#brand").click());

// YouTube video can be collapsed to audio-only (the player keeps playing —
// the iframe is just clipped out of view, not removed).
const ytWidget = $("#yt-widget");
$("#yt-toggle").addEventListener("click", () => {
    const collapsed = ytWidget.classList.toggle("collapsed");
    const btn = $("#yt-toggle");
    btn.textContent = collapsed ? "▸ Show video" : "▾ Hide";
    btn.title = collapsed ? "Show video" : "Hide video";
});

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

// Move the shared iframe before loading, including queue auto-advance. Moving a
// live iframe recreates it, so doing this after engine.play would lose the video.
function prepareTrackPlayback(track) {
    if (isOneOff() && state.channelVideo) return;
    state.channelVideo = null;
    state.channelPlaybackError = "";
    const videoId = youTubeId(track.url);
    if (/^[\w-]{11}$/.test(videoId || "")) {
        state.playlistVideo = { videoId, title: track.name || "YouTube video", channelTitle: track.channelTitle || "YouTube", url: track.url };
        state.playlistReturnIndex = playingIndex();
        setYouTubeHost(channelView.playerSlot);
    } else {
        state.playlistVideo = null;
        state.playlistReturnIndex = null;
        setYouTubeHost($("#player-bar"));
    }
}

// Keep the equalizer + row icons in sync with the real play/pause state
// (covers pausing via the native audio controls too).
const audioEl = $("#audio");
const viz = $("#viz");
function reflectPlayState() {
    if (state.playlistVideo && !currentTrack()) {
        state.playlistVideo = null;
        setYouTubeHost($("#player-bar"));
        $("#yt-widget").hidden = true;
    }
    viz.classList.toggle("playing", isPlaying());
    updatePlayAllBtn();
    renderTracks();
    updateNowPlaying();
    const transport = $("#player-toggle");
    transport.classList.toggle("hidden", !(state.channelVideo || state.playlistVideo) || !!state.channelPlaybackError);
    iconText(transport, isPlaying() ? "pause" : "play", isPlaying() ? "Pause" : "Play");
    transport.setAttribute("aria-label", isPlaying() ? "Pause playback" : "Resume playback");
    channelView?.reflectPlayback(state.playlistVideo || state.channelVideo, isPlaying(), state.channelPlaybackError);
}

$("#player-toggle").addEventListener("click", toggleChannelPlayback);
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
