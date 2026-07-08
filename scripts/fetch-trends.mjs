// ============================================================================
//  fetch-trends.mjs — snapshot MENA/Egypt music charts into data/trending.json
//
//  Runs server-side (locally or in GitHub Actions), so there is no CORS: it
//  reaches each source directly and writes ONE normalized JSON file that the
//  static client fetches same-origin. No API keys are required for Deezer or
//  Apple; YouTube cards are produced only when YT_API_KEY is set (otherwise
//  YouTube falls back to a link-out tile).
//
//  Run:  node scripts/fetch-trends.mjs
//  Out:  data/trending.json
// ============================================================================

import https from "https";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "data", "trending.json");

const REGION = "EG";
const PER_SOURCE = 20;                         // tracks kept per card source
const DEEZER_EGYPT_CHART = "1362501615";       // "Top Egypt" — user: Deezer Charts

// Curated link-out targets for sources we can't (or choose not to) card.
const ANGHAMI_TOP_EGYPT = "https://play.anghami.com/playlist/6471768";
const SPOTIFY_TOP_EGYPT = "https://open.spotify.com/search/Top%2050%20Egypt/playlists";
const YT_CHARTS_EGYPT   = "https://charts.youtube.com/charts/TopSongs/eg";

// ---- tiny JSON GET with redirect handling (works on Node 16 + 18) ----------
function getJSON(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "m3uplay-trends/1.0" } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return res(getJSON(r.headers.location));
      }
      let d = "";
      r.on("data", c => (d += c));
      r.on("end", () => {
        try { res(JSON.parse(d)); }
        catch (e) { rej(new Error(`bad JSON from ${url}: ${d.slice(0, 160)}`)); }
      });
    }).on("error", rej);
  });
}

// ---- per-source fetchers ---------------------------------------------------
async function fetchDeezer() {
  // Over-fetch, then dedupe (the chart playlist repeats some remix versions) and
  // keep the first PER_SOURCE unique title+artist rows in the playlist's order.
  const j = await getJSON(`https://api.deezer.com/playlist/${DEEZER_EGYPT_CHART}/tracks?limit=${PER_SOURCE * 2}`);
  const seen = new Set();
  const tracks = [];
  for (const t of (j.data || [])) {
    if (!t || !t.preview) continue;             // only tracks with a playable preview
    const title = t.title_short || t.title || "";
    const artist = (t.artist && t.artist.name) || "";
    const key = (title + "|" + artist).toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      rank: tracks.length + 1,
      title, artist,
      thumb: (t.album && t.album.cover_medium) || "",
      deezerId: t.id,                           // resolve a FRESH preview at play
      link: t.link || ""                        // time (signed URLs expire ~15min)
    });
    if (tracks.length >= PER_SOURCE) break;
  }
  return {
    id: "deezer", label: "Deezer", chart: "Top Egypt", play: "preview",
    chartUrl: `https://www.deezer.com/playlist/${DEEZER_EGYPT_CHART}`, tracks
  };
}

async function fetchApple() {
  const j = await getJSON(`https://rss.applemarketingtools.com/api/v2/${REGION.toLowerCase()}/music/most-played/${PER_SOURCE}/songs.json`);
  const results = (j.feed && j.feed.results) || [];
  const tracks = results.map((s, i) => ({
    rank: i + 1,
    title: s.name || "",
    artist: s.artistName || "",
    thumb: (s.artworkUrl100 || "").replace("100x100bb", "300x300bb"),
    link: s.url || ""                           // opens Apple Music (link-out)
  }));
  return {
    id: "apple", label: "Apple Music", chart: "Most-played · EG", play: "link",
    chartUrl: (j.feed && j.feed.link) || "https://music.apple.com/eg", tracks
  };
}

async function fetchYouTube() {
  const key = process.env.YT_API_KEY;
  if (!key) {
    // No key → link-out tile (no per-track cards). Add the secret to upgrade.
    return { id: "youtube", label: "YouTube", chart: "Music charts · EG",
             play: "link", tile: true, chartUrl: YT_CHARTS_EGYPT, tracks: [] };
  }
  const url = "https://www.googleapis.com/youtube/v3/videos"
    + "?part=snippet&chart=mostPopular&videoCategoryId=10"
    + `&regionCode=${REGION}&maxResults=${PER_SOURCE}&key=${key}`;
  const j = await getJSON(url);
  const tracks = (j.items || []).map((v, i) => ({
    rank: i + 1,
    title: v.snippet.title || "",
    artist: v.snippet.channelTitle || "",
    thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
    videoId: v.id,                              // full playback via YT engine
    link: `https://youtu.be/${v.id}`
  }));
  return { id: "youtube", label: "YouTube", chart: "Music · EG", play: "youtube",
           chartUrl: YT_CHARTS_EGYPT, tracks };
}

function tile(id, label, chart, chartUrl, note) {
  return { id, label, chart, play: "link", tile: true, chartUrl, note, tracks: [] };
}

// ---- orchestrate: never let one bad source kill the whole file -------------
async function safe(fn, fallback) {
  try { return await fn(); }
  catch (e) { console.error(`  ! ${fallback.id} failed: ${e.message} — using fallback`); return fallback; }
}

async function main() {
  console.log("Fetching Egypt/MENA trends…");
  const [deezer, apple, youtube] = await Promise.all([
    safe(fetchDeezer, tile("deezer", "Deezer", "Top Egypt", `https://www.deezer.com/playlist/${DEEZER_EGYPT_CHART}`)),
    safe(fetchApple,  tile("apple", "Apple Music", "Most-played · EG", "https://music.apple.com/eg")),
    safe(fetchYouTube, tile("youtube", "YouTube", "Music charts · EG", YT_CHARTS_EGYPT))
  ]);

  const sources = [
    deezer,
    youtube,
    apple,
    tile("anghami", "Anghami", "Top in Egypt", ANGHAMI_TOP_EGYPT,
         "MENA's biggest — can't be embedded, so it opens on Anghami."),
    tile("spotify", "Spotify", "Top 50 · Egypt", SPOTIFY_TOP_EGYPT,
         "Full playback needs Premium — opens on Spotify.")
  ];

  const out = { updated: new Date().toISOString(), region: REGION, sources };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  const counts = sources.map(s => `${s.id}:${s.tracks.length}`).join("  ");
  console.log(`Wrote ${OUT}\n  ${counts}`);
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
