// ============================================================================
//  GITHUB  —  thin wrapper around the GitHub Contents API.
//  Lets us list a folder, read a file, create/update a file, and delete one.
//  All writes create a commit on the configured branch.
// ============================================================================

import { githubConfig as cfg } from "./config.js";

const API = "https://api.github.com";

// --- base64 helpers that survive UTF-8 (accents, non-Latin names, etc.) -----
function encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function decodeBase64(b64) {
    const binary = atob(b64.replace(/\s/g, "")); // GitHub wraps base64 in newlines
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function headers() {
    return {
        "Authorization": `Bearer ${cfg.token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };
}

function contentsUrl(path) {
    return `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

// Public raw URL for a file — this is what you paste into a music player.
export function rawUrl(path) {
    return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${path}`;
}

// Turn an email into a safe folder name, e.g. "a.b@gmail.com" -> "a_b_gmail_com".
export function folderForEmail(email) {
    const safe = (email || "anonymous").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `${cfg.rootFolder}/${safe}`;
}

// List .m3u files inside a folder. Returns [] if the folder doesn't exist yet.
export async function listPlaylists(folder) {
    const res = await fetch(`${contentsUrl(folder)}?ref=${cfg.branch}`, { headers: headers() });
    if (res.status === 404) return []; // no playlists created yet
    if (!res.ok) throw new Error(`List failed (${res.status}): ${await res.text()}`);
    const items = await res.json();
    return items
        .filter(it => it.type === "file" && it.name.toLowerCase().endsWith(".m3u"))
        .map(it => ({ name: it.name, path: it.path, sha: it.sha }));
}

// Read a file's text content + its sha (sha needed to update/delete it later).
export async function getFile(path) {
    const res = await fetch(`${contentsUrl(path)}?ref=${cfg.branch}`, { headers: headers() });
    if (!res.ok) throw new Error(`Read failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return { text: decodeBase64(data.content), sha: data.sha };
}

// Create or update a file. Pass sha when updating an existing file; omit to create.
export async function putFile(path, text, message, sha) {
    const body = {
        message: message || `Update ${path}`,
        content: encodeBase64(text),
        branch: cfg.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(contentsUrl(path), {
        method: "PUT",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Save failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return { sha: data.content.sha }; // new sha for subsequent edits
}

// Delete a file (requires its current sha).
export async function deleteFile(path, sha, message) {
    const res = await fetch(contentsUrl(path), {
        method: "DELETE",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: message || `Delete ${path}`, sha, branch: cfg.branch })
    });
    if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
}
