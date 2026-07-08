// ============================================================================
//  deezer.js — resolves a FRESH 30-second preview URL at play time.
//
//  Deezer signs preview URLs with a ~15-minute expiry, so a URL stored in the
//  daily snapshot is already dead (HTTP 403) by the time anyone clicks. We keep
//  only the permanent track id in data/trending.json and fetch the current
//  preview on demand here — via Deezer's JSONP endpoint, which needs no CORS and
//  no API key (plain fetch() is blocked cross-origin; a <script> tag is not).
// ============================================================================

let seq = 0;

export function fetchPreview(deezerId, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        if (!deezerId) return reject(new Error("no deezer id"));
        const cbName = "__dzcb_" + (++seq);
        const script = document.createElement("script");
        let settled = false;

        const cleanup = () => {
            delete window[cbName];
            script.remove();
            clearTimeout(timer);
        };
        const fail = msg => { if (!settled) { settled = true; cleanup(); reject(new Error(msg)); } };
        const timer = setTimeout(() => fail("deezer timeout"), timeoutMs);

        window[cbName] = (data) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (data && data.preview) resolve(data.preview);
            else reject(new Error("no preview available"));
        };
        script.onerror = () => fail("deezer request failed");
        script.src = `https://api.deezer.com/track/${encodeURIComponent(deezerId)}?output=jsonp&callback=${cbName}`;
        document.head.appendChild(script);
    });
}
