// ============================================================================
//  data.js — loads the snapshot the GitHub Action commits (data/trending.json)
//  and formats the "updated" stamp. Same-origin fetch → no CORS, no API keys in
//  the browser. The client never talks to Deezer/Apple/YouTube directly.
// ============================================================================

export async function loadTrending(url = "data/trending.json") {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`trends: HTTP ${res.status}`);
    const data = await res.json();
    data.sources = (data.sources || []).filter(s => s && s.id);
    for (const s of data.sources) s.tracks = s.tracks || [];
    return data;
}

// "just now" / "23 min ago" / "6h ago" / "2d ago" for the board subtitle.
export function relTime(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return "recently";
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}
