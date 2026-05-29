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

// Turn track objects back into valid extended-M3U text.
export function serializeM3U(tracks) {
    let out = "#EXTM3U\n";
    for (const t of tracks) {
        const name = (t.name || "").trim();
        const duration = Number.isFinite(t.duration) ? t.duration : -1;
        // Only write an #EXTINF line if there is a name; otherwise keep it plain.
        if (name) {
            out += `#EXTINF:${duration},${name}\n`;
        }
        out += `${t.url}\n`;
    }
    return out;
}
