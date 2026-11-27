// DOM-only builders. Untrusted channel/video text is always assigned as text.
import { el } from "../trends_board/dom.js";
import { buildRail } from "../trends_board/rail.js";

export function channelAvatar(channel) {
    const fallback = el("span", { class: "yc-avatar", text: (channel.title || "Y").slice(0, 1) });
    if (!channel.thumb?.startsWith("https://")) return fallback;
    const image = el("img", { class: "yc-avatar", src: channel.thumb, alt: "", loading: "lazy" });
    image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
    return image;
}

export function channelIdentity(channel) {
    return el("div", { class: "yc-identity" }, [channelAvatar(channel),
        el("div", { class: "yc-identity-text" }, [
            el("strong", { text: channel.title }),
            el("span", { class: "yc-muted", text: channel.handle })
        ])
    ]);
}

export function publishedLabel(value, now = Date.now()) {
    const date = Date.parse(value);
    if (!Number.isFinite(date)) return "";
    const minutes = Math.max(0, Math.floor((now - date) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function videoCard(video, onPlay) {
    const image = el("img", { src: video.thumb, alt: "", loading: "lazy", draggable: "false" });
    image.addEventListener("error", () => image.remove(), { once: true });
    const badge = el("span", { class: "yc-play-badge", text: "▶" });
    const button = el("button", {
        type: "button", class: "yc-card", "aria-label": `Play ${video.title}`,
        dataset: { videoId: video.videoId }, onclick: () => onPlay(video)
    }, [
        el("span", { class: "yc-thumbnail" }, [image, badge]),
        el("span", { class: "yc-video-title", text: video.title, title: video.title }),
        el("time", { class: "yc-muted", datetime: video.publishedAt, text: publishedLabel(video.publishedAt) })
    ]);
    return button;
}

export function buildChannelRow(channel, feed, handlers) {
    const moveButton = (text, delta) => {
        const button = el("button", { type: "button", class: `ghost yc-move-${delta < 0 ? "up" : "down"}`, text, onclick: () => {
            menu.open = false;
            handlers.onMove(channel, delta);
        } });
        return button;
    };
    const menu = el("details", { class: "yc-menu" }, [
        el("summary", { "aria-label": `Options for ${channel.title}`, title: "Channel options", text: "⋯" }),
        el("div", { class: "yc-menu-items" }, [
            el("a", { href: `https://www.youtube.com/channel/${channel.channelId}`,
                target: "_blank", rel: "noopener noreferrer", text: "Open on YouTube ↗" }),
            moveButton("Move up", -1), moveButton("Move down", 1),
            el("button", { type: "button", class: "ghost yc-remove", text: "Remove channel", onclick: () => {
                menu.open = false;
                handlers.onRemove(channel);
            } })
        ])
    ]);
    menu.addEventListener("keydown", event => {
        if (event.key === "Escape") { menu.open = false; menu.querySelector("summary").focus(); }
    });
    const refresh = el("button", { type: "button", class: "ghost yc-refresh", text: "Refresh",
        "aria-label": `Refresh ${channel.title}`, onclick: () => handlers.onRefresh(channel) });
    refresh.disabled = !feed || feed.loading;
    const bodyId = `yc-videos-${channel.channelId}`;
    const body = el("div", { id: bodyId, class: "yc-channel-body" });
    body.hidden = !!channel.collapsed;
    const collapse = el("button", { type: "button", class: "ghost yc-collapse",
        text: channel.collapsed ? "▸" : "▾", "aria-expanded": String(!channel.collapsed),
        "aria-controls": bodyId, "aria-label": `${channel.collapsed ? "Expand" : "Collapse"} ${channel.title}`,
        title: channel.collapsed ? "Expand videos" : "Collapse videos", onclick: () => handlers.onCollapse(channel) });
    const drag = el("button", { type: "button", class: "ghost yc-drag-handle", text: "⠿",
        "aria-label": `Reorder ${channel.title}. Use up and down arrow keys.`,
        "aria-describedby": "yc-reorder-help", title: "Drag to reorder · ↑/↓ with keyboard" });
    const row = el("section", { class: "yc-channel", "aria-label": channel.title,
        dataset: { channelId: channel.channelId } }, [
        el("div", { class: "yc-channel-head" }, [drag, collapse, channelIdentity(channel), refresh, menu]), body
    ]);
    if (!feed || feed.loading) {
        body.append(el("p", { class: "yc-muted", role: "status", text: "Loading recent videos…" }));
    } else if (feed.error) {
        body.append(el("p", { class: "yc-feed-error", role: "status", text: feed.error }));
    } else if (!feed.videos.length) {
        body.append(el("p", { class: "yc-muted", text: "No public videos yet." }));
    } else {
        const rail = buildRail(feed.videos.map(video => videoCard(video, handlers.onPlay)));
        rail.querySelector(".tb-rail").setAttribute("aria-label", `Recent videos from ${channel.title}`);
        body.append(rail);
    }
    return row;
}
