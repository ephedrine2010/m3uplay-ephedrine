// Reuse the existing owner-protected collection; no new Firestore rules needed.
// These documents are excluded from the playlist sidebar by js/firestore.js.
import {
    getFirestore, collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp,
    updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { app } from "../firebase.js";
import { compareChannels } from "./preferences.js";

const db = getFirestore(app);
export const CHANNEL_KIND = "youtube-channel";

export async function listChannels(uid) {
    const snapshot = await getDocs(query(collection(db, "playlists"), where("owner", "==", uid)));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
        .filter(item => item.kind === CHANNEL_KIND)
        .sort(compareChannels);
}

export async function saveChannel(uid, channel) {
    const id = `${uid}_yt_${channel.channelId}`;
    await setDoc(doc(db, "playlists", id), {
        owner: uid, kind: CHANNEL_KIND,
        channelId: channel.channelId, title: channel.title, handle: channel.handle,
        thumb: channel.thumb, uploadsId: channel.uploadsId, url: channel.url,
        addedAt: serverTimestamp(),
        position: Number.isFinite(channel.position) ? channel.position : 0, collapsed: false
    });
    return { ...channel, id };
}

export async function deleteChannel(id) {
    await deleteDoc(doc(db, "playlists", id));
}

export async function saveChannelOrder(channels) {
    // One atomic update: a failed save cannot persist half of a new order.
    const batch = writeBatch(db);
    channels.forEach((channel, position) => batch.update(doc(db, "playlists", channel.id), { position }));
    await batch.commit();
}

export async function saveChannelCollapsed(id, collapsed) {
    await updateDoc(doc(db, "playlists", id), { collapsed });
}
