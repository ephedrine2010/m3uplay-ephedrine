// ============================================================================
//  CONFIG  —  fill in the values marked TODO, then save this file.
//  This file holds your settings. Because the GitHub token lives here and
//  ships to the browser, anyone who opens the app can read it. That is the
//  trade-off we accepted (clean URLs, no backend). Use a fine-grained token
//  scoped to ONLY this one repo, with "Contents: Read and write" permission.
// ============================================================================

// --- Firebase (used ONLY for Google sign-in, to get the user's email) -------
// This is your cashFollowup project config. It is safe to be public.
export const firebaseConfig = {
    apiKey: "AIzaSyCsNhNFl3kvPKPtyKasaDAF2Kv7vcbAiV8",
    authDomain: "cashfollowup.firebaseapp.com",
    projectId: "cashfollowup",
    storageBucket: "cashfollowup.firebasestorage.app",
    messagingSenderId: "297999980788",
    appId: "1:297999980788:web:ab609eae4a331feacb66a1",
    measurementId: "G-NTR66XSRLK"
};

// --- GitHub repo that stores the playlists -----------------------------------
export const githubConfig = {
    owner:  "TODO_your_github_username",   // e.g. "ephedrine2010"
    repo:   "TODO_your_repo_name",         // e.g. "my-playlists"
    branch: "main",                        // default branch of that repo
    token:  "TODO_your_fine_grained_token",// github_pat_... (Contents: read & write)

    // All playlists live under this top-level folder, then one sub-folder
    // per user (named from their email). e.g. playlists/user_at_gmail_com/
    rootFolder: "playlists"
};
