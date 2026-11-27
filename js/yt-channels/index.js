// View lifecycle and dialog UI only; account/feed/playback state stays in app.js.
import { el } from "../trends_board/dom.js";
import { buildChannelRow } from "./view.js";
import { createChannelDialog } from "./dialog.js";
import { enableChannelReorder } from "./reorder.js";

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
            el("p", { class: "yc-muted", text: "Recent uploads from the channels you choose." }),
            el("p", { id: "yc-reorder-help", class: "yc-muted", text: "Drag ⠿ to reorder · Use ▾ to collapse a row." })
        ]), addButton]), panel, status, retry, rows
    ]);
    mount.append(root);
    const dialog = createChannelDialog({ mount: document.body, resolveChannel: deps.resolveChannel,
        onAdd: deps.onAdd, exists: deps.exists });
    addButton.addEventListener("click", dialog.open);
    const rowCache = new Map();
    let latestProps = null;
    const reorder = enableChannelReorder({ rows, onReorder: deps.onReorder,
        onEnd: () => { if (latestProps) render(latestProps); } });

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

    function render(props) {
        latestProps = props;
        const { channels, feeds, loading, error, configured, video, playing, playbackError, preferencesSaving } = props;
        const busy = !!(loading || preferencesSaving);
        addButton.disabled = busy;
        retry.disabled = busy;
        root.setAttribute("aria-busy", String(busy));
        status.textContent = loading ? "Loading your channels…" : preferencesSaving ? "Saving channel layout…" : error ||
            (!configured ? "YouTube channel lookup has not been set up by the app owner yet. Your saved channels are kept." :
                !channels.length ? "Add your first YouTube channel to see its recent videos here." : "");
        retry.classList.toggle("hidden", !error || loading);
        const wanted = new Set(channels.map(channel => channel.channelId));
        if (reorder.isActive()) {
            if (loading || wanted.size !== rowCache.size || [...rowCache.keys()].some(id => !wanted.has(id))) {
                reorder.cancel();
            } else {
                // Feed responses may arrive during a gesture. Reconcile on drop
                // so the dragged DOM and pointer capture stay intact.
                reflectPlayback(video, playing, playbackError);
            }
            return;
        }
        for (const [id, cached] of rowCache) {
            if (!wanted.has(id)) {
                cached.node.querySelectorAll(".tb-rail-wrap").forEach(rail => rail.dispose?.());
                cached.node.remove();
                rowCache.delete(id);
            }
        }
        channels.forEach((channel, position) => {
            // Saving positions/busy state must not rebuild rails or reset their scroll.
            const key = JSON.stringify([channel.channelId, channel.title, channel.handle, channel.thumb, feeds[channel.channelId]]);
            let cached = rowCache.get(channel.channelId);
            if (!cached || cached.key !== key) {
                cached?.node.querySelectorAll(".tb-rail-wrap").forEach(rail => rail.dispose?.());
                const node = buildChannelRow(channel, feeds[channel.channelId], deps);
                if (cached) cached.node.replaceWith(node);
                cached = { key, node };
                rowCache.set(channel.channelId, cached);
            }
            cached.node.querySelector(".yc-drag-handle").disabled = busy || channels.length < 2;
            const collapse = cached.node.querySelector(".yc-collapse");
            collapse.disabled = busy;
            collapse.textContent = channel.collapsed ? "▸" : "▾";
            collapse.title = channel.collapsed ? "Expand videos" : "Collapse videos";
            collapse.setAttribute("aria-expanded", String(!channel.collapsed));
            collapse.setAttribute("aria-label", `${channel.collapsed ? "Expand" : "Collapse"} ${channel.title}`);
            cached.node.classList.toggle("yc-collapsed", !!channel.collapsed);
            cached.node.querySelector(".yc-channel-body").hidden = !!channel.collapsed;
            cached.node.querySelector(".yc-remove").disabled = busy;
            cached.node.querySelector(".yc-move-up").disabled = busy || position === 0;
            cached.node.querySelector(".yc-move-down").disabled = busy || position === channels.length - 1;
            if (rows.children[position] !== cached.node) rows.insertBefore(cached.node, rows.children[position] || null);
        });
        reflectPlayback(video, playing, playbackError);
    }

    return {
        root, playerSlot, render,
        reflectPlayback,
        closeDialog: dialog.close,
        cancelDrag: reorder.cancel,
        focusChannel(id, selector) { rowCache.get(id)?.node.querySelector(selector)?.focus({ preventScroll: true }); }
    };
}
