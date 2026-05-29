# 🎵 M3U Playlist Manager

A static web app to create and edit `.m3u` playlists stored in a GitHub repo.
Users sign in with Google (Firebase Auth) and get their own folder, named from
their email. Each playlist gets a public `raw.githubusercontent.com` URL you can
paste into VLC or any music player.

```
Sign in (Google)  →  pick/create playlist  →  add mp3 links  →  Save  →  Copy link  →  play in any player
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | The page shell (sign-in, library view, editor view) |
| `css/style.css` | Styling |
| `js/config.js` | **You edit this** — GitHub repo + token, Firebase config |
| `js/auth.js` | Firebase Google sign-in |
| `js/github.js` | Read/write playlists via the GitHub Contents API |
| `js/m3u.js` | Parse & serialize `.m3u` text |
| `js/app.js` | UI logic tying it all together |

## Setup (one time)

### 1. Fill in `js/config.js`
- `owner` / `repo` — the GitHub repo that will hold the playlists.
- `branch` — usually `main`.
- `token` — a **fine-grained personal access token**:
  - GitHub → Settings → Developer settings → Fine-grained tokens → Generate.
  - **Repository access:** only the one playlists repo.
  - **Permissions:** *Contents → Read and write*.
  - Paste the `github_pat_…` value into `token`.

### 2. Authorize your domain in Firebase
Firebase → your project → Authentication → Settings → **Authorized domains** →
add the domain you'll serve the app from (e.g. `yourname.github.io`, and
`localhost` for local testing). Also enable **Google** as a sign-in provider
under Authentication → Sign-in method.

### 3. Serve the app (it will NOT work from file://)
Google sign-in popups and ES-module imports require http(s). Options:
- **Local test:** run a static server in this folder, e.g.
  `python -m http.server 8000` → open <http://localhost:8000>.
- **Deploy:** push these files to your repo and enable **GitHub Pages**
  (Settings → Pages → deploy from branch). App lives at
  `https://<owner>.github.io/<repo>/`.

## ⚠️ Security note (read this)

The GitHub token sits in `js/config.js`, which ships to every visitor's browser.
**Anyone who opens the app can read the token and could edit or delete any file
in the repo** — the per-user folders are a naming convention, not a security
wall. This is the accepted trade-off for a no-backend, clean-URL setup. Use it
for a personal/trusted-users project only. Scope the token to a single repo so
the blast radius is limited to that repo. Do **not** commit a real token to a
public repo you care about.

## Playing a playlist

In the app, click **Copy m3u link**, then in VLC: *Media → Open Network Stream*
and paste it. Mobile players: use their "add playlist by URL" field.
