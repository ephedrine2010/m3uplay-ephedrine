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

// Pull the first http(s) URL out of pasted text. Share buttons (e.g. Anghami's
// "♫ استمع إلى … https://open.anghami.com/…") copy a whole sentence around the
// link, so we extract just the URL and drop any surrounding text. Trailing
// junk often stuck to a shared link (closing quotes/brackets/punctuation) is
// trimmed. Returns the original trimmed text if no URL is found.
export function extractUrl(text) {
    const m = (text || "").match(/https?:\/\/[^\s]+/i);
    if (!m) return (text || "").trim();
    return m[0].replace(/["'”’»)\]>.,؛،]+$/, "");
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

// Derive a readable default name from a media URL's filename.
// e.g. ".../Albumaty.Com_amr-diab_02._Yetalemo.mp3" -> "Albumaty.Com amr-diab 02. Yetalemo"
export function nameFromUrl(url) {
    // YouTube watch URLs have no useful filename ("watch") — give a clean label.
    if (isYouTube(url)) return "YouTube video";
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
