// ============================================================================
//  AUTH  —  Firebase Google sign-in. Used to learn the user's email (which
//  names their playlist folder) AND to authorize writes to Firebase Storage.
// ============================================================================

import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./firebase.js";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Call cb(user|null) now and whenever the sign-in state changes.
export function watchAuth(cb) {
    onAuthStateChanged(auth, cb);
}

export async function signIn() {
    const result = await signInWithPopup(auth, provider);
    return result.user;
}

export async function signOutUser() {
    await signOut(auth);
}
