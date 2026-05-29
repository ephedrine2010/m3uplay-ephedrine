// ============================================================================
//  APP  —  ties auth + GitHub + M3U + the UI together.
//  Two views: #library-view (list/create playlists) and #editor-view
//  (add/modify/delete tracks, save, copy link).
// ============================================================================

import { watchAuth, signIn, signOutUser } from "./auth.js";
import {
    folderForEmail, listPlaylists, getFile, putFile, deleteFile, rawUrl
} from "./github.js";
import { parseM3U, serializeM3U } from "./m3u.js";

// ---- app state -------------------------------------------------------------
const state = {
    user: null,        // firebase user
    folder: null,      // playlists/<email>
    current: null,     // { name, path, sha } of the open playlist
    tracks: []         // editable track objects for the open playlist
};

// ---- tiny DOM helpers ------------------------------------------------------
const $ = sel => document.querySelector(sel);
const show = sel => $(sel).classList.remove("hidden");
const hide = sel => $(sel).classList.add("hidden");

function setStatus(msg, isError = false) {
    const el = $("#status");
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
}

function showView(view) {
    hide("#library-view");
    hide("#editor-view");
    show(view);
}

// ============================================================================
//  AUTH WIRING
// ============================================================================
watchAuth(async (user) => {
    state.user = user;
    if (user) {
        state.folder = folderForEmail(user.email);
        $("#user-email").textContent = user.email;
        hide("#signin-box");
        show("#app");
        show("#user-bar");
        await openLibrary();
    } else {
        state.folder = null;
        show("#signin-box");
        hide("#app");
        hide("#user-bar");
    }
});

$("#signin-btn").addEventListener("click", async () => {
    try { await signIn(); }
    catch (e) { setStatus(e.message, true); }
});

$("#signout-btn").addEventListener("click", () => signOutUser());

// ============================================================================
//  LIBRARY VIEW  —  list playlists, create a new one
// ============================================================================
async function openLibrary() {
    showView("#library-view");
    setStatus("Loading your playlists…");
    try {
        const playlists = await listPlaylists(state.folder);
        renderLibrary(playlists);
        setStatus("");
    } catch (e) {
        setStatus(e.message, true);
    }
}

function renderLibrary(playlists) {
    const ul = $("#playlist-list");
    ul.innerHTML = "";
    if (playlists.length === 0) {
        ul.innerHTML = `<li class="empty">No playlists yet. Create your first one below.</li>`;
        return;
    }
    for (const pl of playlists) {
        const li = document.createElement("li");

        const name = document.createElement("span");
        name.className = "pl-name";
        name.textContent = pl.name;

        const openBtn = document.createElement("button");
        openBtn.textContent = "Open";
        openBtn.addEventListener("click", () => openEditor(pl));

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "Copy link";
        copyBtn.className = "secondary";
        copyBtn.addEventListener("click", () => copyLink(pl.path));

        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.className = "danger";
        delBtn.addEventListener("click", () => removePlaylist(pl));

        li.append(name, openBtn, copyBtn, delBtn);
        ul.appendChild(li);
    }
}

$("#create-btn").addEventListener("click", async () => {
    let name = ($("#new-name").value || "").trim();
    if (!name) { setStatus("Enter a playlist name.", true); return; }
    if (!name.toLowerCase().endsWith(".m3u")) name += ".m3u";
    name = name.replace(/[^a-z0-9._-]+/gi, "_"); // keep filenames safe

    const path = `${state.folder}/${name}`;
    setStatus("Creating playlist…");
    try {
        await putFile(path, serializeM3U([]), `Create playlist ${name}`);
        $("#new-name").value = "";
        await openLibrary();
    } catch (e) {
        setStatus(e.message, true);
    }
});

async function removePlaylist(pl) {
    if (!confirm(`Delete "${pl.name}"? This cannot be undone.`)) return;
    setStatus("Deleting…");
    try {
        await deleteFile(pl.path, pl.sha, `Delete playlist ${pl.name}`);
        await openLibrary();
    } catch (e) {
        setStatus(e.message, true);
    }
}

// ============================================================================
//  EDITOR VIEW  —  add / modify / delete tracks, save, copy link
// ============================================================================
async function openEditor(pl) {
    setStatus("Opening…");
    try {
        const { text, sha } = await getFile(pl.path);
        state.current = { ...pl, sha };
        state.tracks = parseM3U(text);
        $("#editor-title").textContent = pl.name;
        renderTracks();
        showView("#editor-view");
        setStatus("");
    } catch (e) {
        setStatus(e.message, true);
    }
}

function renderTracks() {
    const ul = $("#track-list");
    ul.innerHTML = "";
    if (state.tracks.length === 0) {
        ul.innerHTML = `<li class="empty">No tracks yet. Add an mp3 link below.</li>`;
        return;
    }
    state.tracks.forEach((t, i) => {
        const li = document.createElement("li");

        const nameInput = document.createElement("input");
        nameInput.className = "track-name";
        nameInput.placeholder = "Name (optional)";
        nameInput.value = t.name || "";
        nameInput.addEventListener("input", () => { t.name = nameInput.value; });

        const urlInput = document.createElement("input");
        urlInput.className = "track-url";
        urlInput.placeholder = "https://…/song.mp3";
        urlInput.value = t.url || "";
        urlInput.addEventListener("input", () => { t.url = urlInput.value; });

        const upBtn = document.createElement("button");
        upBtn.textContent = "↑";
        upBtn.className = "secondary";
        upBtn.disabled = i === 0;
        upBtn.addEventListener("click", () => moveTrack(i, -1));

        const downBtn = document.createElement("button");
        downBtn.textContent = "↓";
        downBtn.className = "secondary";
        downBtn.disabled = i === state.tracks.length - 1;
        downBtn.addEventListener("click", () => moveTrack(i, +1));

        const delBtn = document.createElement("button");
        delBtn.textContent = "✕";
        delBtn.className = "danger";
        delBtn.addEventListener("click", () => { state.tracks.splice(i, 1); renderTracks(); });

        li.append(nameInput, urlInput, upBtn, downBtn, delBtn);
        ul.appendChild(li);
    });
}

function moveTrack(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.tracks.length) return;
    [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
    renderTracks();
}

$("#add-track-btn").addEventListener("click", () => {
    const url = ($("#add-url").value || "").trim();
    const name = ($("#add-name").value || "").trim();
    if (!url) { setStatus("Paste an mp3 link first.", true); return; }
    state.tracks.push({ url, name, duration: -1 });
    $("#add-url").value = "";
    $("#add-name").value = "";
    setStatus("");
    renderTracks();
});

$("#save-btn").addEventListener("click", async () => {
    const cleaned = state.tracks.filter(t => (t.url || "").trim() !== "");
    setStatus("Saving…");
    try {
        const text = serializeM3U(cleaned);
        const { sha } = await putFile(
            state.current.path, text, `Update playlist ${state.current.name}`, state.current.sha
        );
        state.current.sha = sha; // keep latest sha so further saves work
        state.tracks = cleaned;
        renderTracks();
        setStatus("Saved ✓");
    } catch (e) {
        setStatus(e.message, true);
    }
});

$("#copy-editor-link-btn").addEventListener("click", () => copyLink(state.current.path));

$("#back-btn").addEventListener("click", () => openLibrary());

// ============================================================================
//  SHARED
// ============================================================================
async function copyLink(path) {
    const url = rawUrl(path);
    try {
        await navigator.clipboard.writeText(url);
        setStatus(`Link copied: ${url}`);
    } catch {
        // Clipboard API can fail on file:// — show the URL so it can be copied manually.
        setStatus(`Copy this link: ${url}`);
    }
}
