# 🎵 M3U Playlist Manager

A static web app to create and edit `.m3u` playlists, stored in **Firebase
Storage**. Users sign in with Google and get their own folder (named from their
email). Each playlist has a public URL you can paste into VLC or any music player.

```
Sign in (Google)  →  pick/create playlist  →  add mp3 links  →  Save  →  Copy link  →  play anywhere
```

There is **no secret token anywhere** — write access comes from being signed in,
checked by Firebase Storage Rules on Google's servers. Nothing to leak.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell (Google sign-in, library view, editor view) |
| `css/style.css` | Styling |
| `js/config.js` | Firebase config + folder name (no secrets) |
| `js/firebase.js` | Initializes Firebase once, shared by other modules |
| `js/auth.js` | Google sign-in |
| `js/storage.js` | List/read/write/delete playlists in Firebase Storage |
| `js/m3u.js` | Parse & serialize `.m3u` text |
| `js/app.js` | UI logic |

## Setup (one time, in the Firebase console)

Project: **m3uplay-d9b1f** → <https://console.firebase.google.com/>

### 1. Enable Google sign-in
Authentication → **Sign-in method** → enable **Google**.

### 2. Authorize your domains
Authentication → **Settings** → **Authorized domains** → add:
- `localhost` (for local testing)
- `ephedrine2010.github.io` (your GitHub Pages domain, if you deploy there)

### 3. Create Storage + set Rules
Build → **Storage** → Get started (pick a location).
Then **Rules** tab → paste this → **Publish**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /playlists/{userFolder}/{file=**} {
      allow read: if true;                  // public so music players can fetch
      allow write: if request.auth != null; // any signed-in user can save
    }
  }
}
```

> Note: this lets any signed-in user write to any folder — matching the
> "login is just for naming" model. The folders organize playlists; they are
> not a strict security wall. Fine for a personal/trusted app.

### 4. Set CORS on the Storage bucket (needed so the editor can LOAD playlists)
The browser fetching file contents cross-origin needs CORS. Run once with the
[gcloud CLI](https://cloud.google.com/sdk/docs/install) (`gsutil`):

Create `cors.json`:
```json
[
  {
    "origin": ["http://localhost:8000", "https://ephedrine2010.github.io"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```
Then:
```
gsutil cors set cors.json gs://m3uplay-d9b1f.firebasestorage.app
```
(Skip/adjust origins to match wherever you actually serve the app.)

## Run it (NOT from file:// — needs http for ES modules + Google popup)

- **Local:** `python -m http.server 8000` in this folder → <http://localhost:8000>
- **Deploy:** push to your repo and enable **GitHub Pages**
  (Settings → Pages → deploy from `main` / root) →
  `https://ephedrine2010.github.io/m3uplay-ephedrine/`

## Playing a playlist

Click **Copy m3u link** in the app, then in VLC: *Media → Open Network Stream*
and paste it. Mobile players: use their "add playlist by URL" field.

## Housekeeping

The old GitHub personal access token from the earlier design is no longer used —
**revoke it** at GitHub → Settings → Developer settings → Fine-grained tokens.
