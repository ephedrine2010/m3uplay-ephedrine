// ============================================================================
//  FIRESTORE  —  playlists are stored as documents (no files, no Storage).
//  Shape:  playlists/{id} = { owner, name, tracks: [{name, url}], updatedAt }
//  Writes are authorized by Firestore Security Rules (signed-in owner).
// ============================================================================

import {
    getFirestore, collection, query, where, getDocs,
    addDoc, doc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { app } from "./firebase.js";

const db = getFirestore(app);
const playlistsRef = collection(db, "playlists");

// All playlists owned by this user, sorted by name.
export async function listPlaylists(uid) {
    const snap = await getDocs(query(playlistsRef, where("owner", "==", uid)));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return out;
}

// Create a playlist (optionally pre-filled, e.g. from an imported file).
export async function createPlaylist(uid, name, tracks = []) {
    const ref = await addDoc(playlistsRef, {
        owner: uid,
        name,
        tracks,
        updatedAt: serverTimestamp()
    });
    return ref.id;
}

// Persist the track list of a playlist. tracks = [{ name, url }].
export async function savePlaylistTracks(id, tracks) {
    await updateDoc(doc(db, "playlists", id), {
        tracks,
        updatedAt: serverTimestamp()
    });
}

export async function renamePlaylist(id, name) {
    await updateDoc(doc(db, "playlists", id), { name, updatedAt: serverTimestamp() });
}

export async function deletePlaylist(id) {
    await deleteDoc(doc(db, "playlists", id));
}
