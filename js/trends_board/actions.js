// ============================================================================
//  actions.js — the hybrid click behaviour, isolated in one place. A card/tile
//  activation is dispatched to the right effect based on the source's `play`
//  mode. The player and the external-open helper are INJECTED, so this module
//  stays decoupled from app.js, player.js and the DOM.
//
//    preview  → play the 30s MP3 in-app (Deezer)
//    youtube  → play the video in-app via the YouTube engine
//    link     → open the track / chart on its source site (new tab)
// ============================================================================

export function makeHandlers({ player, openExternal, notify, resolvePreview }) {
    async function onActivate(track, source) {
        const label = `${track.title} — ${track.artist}`;
        if (source.play === "preview") {
            // Deezer preview URLs expire in ~15 min, so resolve a fresh one now.
            try {
                notify && notify(`Loading ${track.title}…`);
                const url = (track.deezerId && resolvePreview)
                    ? await resolvePreview(track.deezerId)
                    : track.preview;
                if (!url) throw new Error("no preview");
                player.playOneOff({ name: label, url });
                notify && notify(`Preview · ${track.title}`);
            } catch (e) {
                notify && notify("Preview unavailable — opening on Deezer ↗");
                openExternal(track.link, source.label);
            }
        } else if (source.play === "youtube" && track.videoId) {
            player.playOneOff({ name: label, url: `https://youtu.be/${track.videoId}` });
        } else {
            openExternal(track.link, source.label);
        }
    }

    function onOpen(source) {
        const url = source.chartUrl
            || (source.tracks[0] && source.tracks[0].link);
        openExternal(url, source.label);
    }

    return { onActivate, onOpen };
}
