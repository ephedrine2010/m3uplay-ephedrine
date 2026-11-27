// View lifecycle and dialog UI only; account/feed/playback state stays in app.js.
import { el } from "../trends_board/dom.js";
import { buildChannelRow } from "./view.js";
import { createChannelDialog } from "./dialog.js";

export function initYouTubeChannels({ mount, deps }) {
    const rows = el("div", { class: "yc-rows" });
    const status = el("div", { class: "yc-status", role: "status", "aria-live": "polite" });
    const retry = el("button", { type: "button", class: "ghost hidden", text: "Try again", onclick: deps.onRetry });
    const addButton = el("button", { type: "button", text: "+ Add YouTube channel" });
    const panel = el("dialog", { class: "yc-player", "aria-label": "YouTube video player" });
    const playerTitle = el("strong");
    const playerChannel = el("span", { class: "yc-muted" });
    const playerSlot = el("div", { class: "yc-player-slot" });
    const fallback = el("div", { class: "yc-fallback hidden", role: "status" });
    const fallbackMessage = el("p");
    const watch = el("a", { class: "yc-watch", target: "_blank", rel: "noopener noreferrer", text: "Watch on YouTube ↗" });
    const transport = el("button", { type: "button", class: "ghost", text: "Pause", onclick: deps.onToggle });
    panel.append(
        el("div", { class: "yc-player-head" }, [el("span", { text: "Now playing" }),
            el("button", { type: "button", class: "ghost", text: "×", "aria-label": "Close video player",
                onclick: deps.onClosePlayer })]),
        playerSlot, fallback, el("div", { class: "yc-player-meta" }, [playerTitle, playerChannel, transport])
    );
    fallback.append(fallbackMessage, watch);
    panel.addEventListener("cancel", event => {
        event.preventDefault();
        deps.onClosePlayer();
    });
    panel.addEventListener("click", event => {
        if (event.target !== panel) return;
        const bounds = panel.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) deps.onClosePlayer();
    });
    const root = el("section", { id: "yt-channels", class: "yc-section", "aria-labelledby": "yc-title" }, [
        el("div", { class: "yc-head" }, [el("div", {}, [
            el("h1", { id: "yc-title", text: "Your YouTube channels" }),
            el("p", { class: "yc-muted", text: "Recent uploads from the channels you choose." })
        ]), addButton]), panel, status, retry, rows
    ]);
    mount.append(root);
    const dialog = createChannelDialog({ mount: document.body, resolveChannel: deps.resolveChannel,
        onAdd: deps.onAdd, exists: deps.exists });
    addButton.addEventListener("click", dialog.open);
    const rowCache = new Map();

    function reflectPlayback(video, playing, error) {
        if (video && !panel.open) panel.showModal();
        else if (!video && panel.open) panel.close();
        fallback.classList.toggle("hidden", !error);
        playerSlot.classList.toggle("hidden", !!error);
        transport.classList.toggle("hidden", !!error || !video);
        if (video) {
            playerTitle.textContent = video.title;
            playerChannel.textContent = video.channelTitle;
            watch.href = `https://www.youtube.com/watch?v=${video.videoId}`;
            fallbackMessage.textContent = error || "";
            transport.textContent = playing ? "Pause" : "Play";
        }
        for (const card of rows.querySelectorAll(".yc-card")) {
            const selected = !!video && card.dataset.videoId === video.videoId;
            card.classList.toggle("yc-selected", selected);
            card.setAttribute("aria-pressed", String(selected));
            card.querySelector(".yc-play-badge").textContent = selected ? (playing ? "▶ Playing" : error ? "Unavailable" : "Paused") : "▶";
        }
    }

    return {
        root, playerSlot,
        render({ channels, feeds, loading, error, configured, video, playing, playbackError }) {
            addButton.disabled = loading;
            status.textContent = loading ? "Loading your channels…" : error ||
                (!configured ? "YouTube channel lookup has not been set up by the app owner yet. Your saved channels are kept." :
                    !channels.length ? "Add your first YouTube channel to see its recent videos here." : "");
            retry.classList.toggle("hidden", !error || loading);
            const wanted = new Set(channels.map(channel => channel.channelId));
            for (const [id, cached] of rowCache) {
                if (!wanted.has(id)) {
                    cached.node.querySelectorAll(".tb-rail-wrap").forEach(rail => rail.dispose?.());
                    cached.node.remove();
                    rowCache.delete(id);
                }
            }
            channels.forEach((channel, position) => {
                const key = JSON.stringify([channel, feeds[channel.channelId]]);
                let cached = rowCache.get(channel.channelId);
                if (!cached || cached.key !== key) {
                    cached?.node.querySelectorAll(".tb-rail-wrap").forEach(rail => rail.dispose?.());
                    const node = buildChannelRow(channel, feeds[channel.channelId], deps);
                    if (cached) cached.node.replaceWith(node);
                    cached = { key, node };
                    rowCache.set(channel.channelId, cached);
                }
                if (rows.children[position] !== cached.node) rows.insertBefore(cached.node, rows.children[position] || null);
            });
            reflectPlayback(video, playing, playbackError);
        },
        reflectPlayback,
        closeDialog: dialog.close
    };
}
