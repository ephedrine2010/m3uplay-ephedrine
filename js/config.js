// ============================================================================
//  CONFIG
//  Playlists are stored in Firebase Storage (your cashFollowup project).
//  There is NO secret token here — Firebase config is safe to be public,
//  and write permission comes from the user being signed in (see auth.js),
//  enforced by Storage Rules on Google's servers. Nothing to leak.
// ============================================================================

// --- Firebase project config (safe to be public) ----------------------------
export const firebaseConfig = {
    apiKey: "AIzaSyCzPTYMJRSmy_jzAevB9-aYzGa3UWLuJSU",
    authDomain: "m3uplay-d9b1f.firebaseapp.com",
    projectId: "m3uplay-d9b1f",
    storageBucket: "m3uplay-d9b1f.firebasestorage.app",
    messagingSenderId: "246665241441",
    appId: "1:246665241441:web:11eb756e7a15ea87779b20",
    measurementId: "G-MR7SXVP5GE"
};

// --- App settings ------------------------------------------------------------
// All playlists live under this top-level folder, then one sub-folder per
// user (named from their email). e.g. playlists/user_at_gmail_com/chill.m3u
export const appConfig = {
    rootFolder: "playlists"
};
