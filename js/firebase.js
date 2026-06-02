// ============================================================================
//  FIREBASE  —  initialize the app ONCE and share it across modules.
//  Both auth.js (sign-in) and firestore.js (playlist data) import `app`.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
