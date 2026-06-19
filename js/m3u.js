// ============================================================================
//  M3U  —  parse an .m3u file into track objects, and serialize back to text.
//  A track is: { url: string, name: string, duration: number }
//  duration -1 means "unknown / stream" (the usual default).
// ============================================================================

// Parse raw .m3u text into an array of track objects.
export function parseM3U(text) {
    const lines = (text || "").split(/\r?\n/);
    const tracks = [];
    let pending = null; // metadata from the last #EXTINF line

    for (let raw of lines) {
        const line = raw.trim();
        if (line === "") continue;

        if (line.toUpperCase().startsWith("#EXTM3U")) {
            continue; // header — ignored, we always re-emit it on save
        }

        if (line.toUpperCase().startsWith("#EXTINF:")) {
            // Format: #EXTINF:<duration>,<title>
            const info = line.slice("#EXTINF:".length);
            const comma = info.indexOf(",");
            let duration = -1;
            let name = "";
            if (comma === -1) {
                duration = parseFloat(info) || -1;
            } else {
                duration = parseFloat(info.slice(0, comma));
                if (Number.isNaN(duration)) duration = -1;
                name = info.slice(comma + 1).trim();
            }
            pending = { duration, name };
            continue;
        }

        if (line.startsWith("#")) {
            continue; // other directives we don't model — skip
        }

        // A non-comment line is a media URL/path.
        tracks.push({
            url: line,
            name: pending ? pending.name : "",
            duration: pending ? pending.duration : -1
        });
        pending = null;
    }

    return tracks;
}

// ---- YouTube URL helpers ---------------------------------------------------
// True for watch / youtu.be / embed / shorts / live links.
export function isYouTube(url) {
    return /(?:youtube\.com\/|youtu\.be\/)/i.test(url || "");
}

// Extract the 11-char video id from any common YouTube URL form, else null.
export function youTubeId(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "");
        if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
        if (host.endsWith("youtube.com")) {
            if (u.searchParams.get("v")) return u.searchParams.get("v");
            const m = u.pathname.match(/\/(?:embed|shorts|v|live)\/([^/?#]+)/);
            if (m) return m[1];
        }
    } catch { /* not a URL */ }
    return null;
}

// ---- Anghami URL helpers ---------------------------------------------------
// True for any anghami.com link (song / album / playlist / artist).
export function isAnghami(url) {
    return /anghami\.com\//i.test(url || "");
}

// Normalize an Anghami share link to its frameable player host. The marketing
// site (www.anghami.com) blocks framing (X-Frame-Options); the player subdomain
// (play.anghami.com) is the one meant to be embedded. The path (e.g.
// /song/12345) is preserved as-is.
export function anghamiEmbedUrl(url) {
    try {
        const u = new URL(url);
        u.hostname = "play.anghami.com";
        return u.toString();
    } catch {
        return url;
    }
}

// Derive a readable default name from a media URL's filename.
// e.g. ".../Albumaty.Com_amr-diab_02._Yetalemo.mp3" -> "Albumaty.Com amr-diab 02. Yetalemo"
export function nameFromUrl(url) {
    // YouTube watch URLs have no useful filename ("watch") — give a clean label.
    if (isYouTube(url)) return "YouTube video";
    // Anghami links are numeric ids (/song/12345) — no readable filename either.
    if (isAnghami(url)) return "Anghami track";
    try {
        const file = decodeURIComponent((url.split("?")[0].split("/").pop() || "").trim());
        const base = file.replace(/\.[^.]+$/, "");      // drop extension
        const pretty = base.replace(/[_+]+/g, " ").trim();
        return pretty || "Track";
    } catch {
        return "Track";
    }
}

// Turn track objects back into valid extended-M3U text.
// Always writes an #EXTINF line (extended format) with a name — using the
// user's name if given, otherwise a default derived from the URL.
export function serializeM3U(tracks) {
    let out = "#EXTM3U\n";
    for (const t of tracks) {
        const url = (t.url || "").trim();
        if (!url) continue;
        const name = (t.name || "").trim() || nameFromUrl(url);
        const duration = Number.isFinite(t.duration) ? t.duration : -1;
        out += `#EXTINF:${duration},${name}\n${url}\n`;
    }
    return out;
}
