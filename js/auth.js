// ============================================================================
//  AUTH  —  Firebase Google sign-in. Used only to learn the user's email,
//  which becomes their playlist folder name. No deep authorization here.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
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
