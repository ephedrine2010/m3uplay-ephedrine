// ============================================================================
//  STORAGE  —  playlist files live in Firebase Storage.
//  No secret token: writes are authorized by the signed-in user (Storage
//  Rules), and reads are public so any music player can fetch the file.
//
//  Keeps the same function shape the app used before (folderForEmail,
//  listPlaylists, getFile, putFile, deleteFile) so app.js barely changes.
//  The old `sha` argument is accepted but ignored — Storage doesn't need it.
// ============================================================================

import {
    getStorage, ref, listAll, uploadString, getBytes, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { app } from "./firebase.js";
import { appConfig as cfg, firebaseConfig } from "./config.js";

const storage = getStorage(app);

// Turn an email into a safe folder path, e.g. "a.b@gmail.com" -> "playlists/a_b_gmail_com".
export function folderForEmail(email) {
    const safe = (email || "anonymous").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `${cfg.rootFolder}/${safe}`;
}

// List .m3u files inside a folder. Returns [] if the folder doesn't exist yet.
export async function listPlaylists(folder) {
    const res = await listAll(ref(storage, folder));
    return res.items
        .filter(it => it.name.toLowerCase().endsWith(".m3u"))
        .map(it => ({ name: it.name, path: it.fullPath }));
}

// Read a file's text content. (sha kept null for app.js compatibility.)
export async function getFile(path) {
    const bytes = await getBytes(ref(storage, path));
    return { text: new TextDecoder().decode(bytes), sha: null };
}

// Create or overwrite a file with the given text.
export async function putFile(path, text, _message, _sha) {
    await uploadString(ref(storage, path), text, "raw", {
        contentType: "audio/x-mpegurl"
    });
    return { sha: null };
}

// Delete a file.
export async function deleteFile(path, _sha, _message) {
    await deleteObject(ref(storage, path));
}

// Public, playable URL for a file — paste this into VLC / any music player.
// Uses the direct Cloud Storage path so the URL ENDS IN ".m3u" (no token /
// query string). That lets players recognize it as a playlist and expand all
// tracks, and the link stays stable across edits. Requires the bucket objects
// to be publicly readable (allUsers:objectViewer).
export function getPlayUrl(path) {
    const bucket = firebaseConfig.storageBucket; // e.g. m3uplay-d9b1f.firebasestorage.app
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `https://storage.googleapis.com/${bucket}/${encoded}`;
}
