// Public YouTube metadata only. Playback goes through the existing iframe engine.
const CHANNEL_ID = /^UC[\w-]{22}$/;
const VIDEO_ID = /^[\w-]{11}$/;

export function parseChannelInput(value) {
    const input = String(value || "").trim();
    if (CHANNEL_ID.test(input)) return { id: input };
    if (/^@[^\s/?#]+$/u.test(input)) return { forHandle: input };
    let url;
    try {
        url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch { throw new Error("Paste a YouTube channel link or @handle."); }
    if (!["https:", "http:"].includes(url.protocol) ||
        !["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname) ||
        url.username || url.password || url.port) {
        throw new Error("Paste a YouTube channel link or @handle.");
    }
    let parts;
    try { parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part)); }
    catch { throw new Error("That channel link is invalid."); }
    if (parts[0]?.startsWith("@") && /^@[^\s/?#]+$/u.test(parts[0])) return { forHandle: parts[0] };
    if (parts[0] === "channel" && CHANNEL_ID.test(parts[1] || "")) return { id: parts[1] };
    if (parts[0] === "user" && /^[^\s/?#]+$/u.test(parts[1] || "")) return { forUsername: parts[1] };
    throw new Error("Use the channel's @handle or /channel/ link, rather than a video or custom /c/ link.");
}

export function createYouTubeApi(config, fetcher = (...args) => fetch(...args)) {
    const cache = new Map();
    const limit = Math.max(1, Math.min(50, Number(config.videoLimit) || 12));

    async function request(resource, params, signal) {
        const apiKey = String(config.apiKey || "").trim();
        if (!apiKey) throw new Error("YouTube channel lookup has not been set up by the app owner yet.");
        const query = new URLSearchParams({ ...params, key: apiKey });
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 15000);
        try {
            const response = await fetcher(`https://www.googleapis.com/youtube/v3/${resource}?${query}`, {
                signal: controller.signal
            });
            const data = await response.json();
            if (!response.ok || data.error) {
                const reasons = new Set([
                    ...(data.error?.errors || []).map(item => item.reason),
                    ...(data.error?.details || []).map(item => item.reason)
                ]);
                const hasReason = (...values) => values.some(value => reasons.has(value));
                if (hasReason("quotaExceeded", "dailyLimitExceeded")) {
                    throw new Error("YouTube's daily request limit was reached. Please try again later.");
                }
                if (hasReason("keyInvalid", "keyExpired", "API_KEY_INVALID")) {
                    throw new Error("The app's YouTube connection uses an invalid or expired API key. Please contact the app owner.");
                }
                if (hasReason("API_KEY_HTTP_REFERRER_BLOCKED", "ipRefererBlocked")) {
                    throw new Error("The app's YouTube connection is not authorized for this website address. Please contact the app owner.");
                }
                if (hasReason("accessNotConfigured", "SERVICE_DISABLED", "API_KEY_SERVICE_BLOCKED")) {
                    throw new Error("The app's YouTube API access is not enabled or allowed. Please contact the app owner.");
                }
                if (response.status === 404) throw new Error("This channel's videos are unavailable.");
                throw new Error("Couldn't load YouTube right now. Please try again later.");
            }
            return data;
        } catch (error) {
            if (signal?.aborted) throw error;
            if (error.name === "AbortError") throw new Error("YouTube took too long to respond. Please try again.");
            if (error instanceof TypeError) throw new Error("Couldn't reach YouTube. Check your connection and try again.");
            throw error;
        } finally {
            clearTimeout(timeout);
            signal?.removeEventListener("abort", abort);
        }
    }

    async function resolveChannel(input, { signal } = {}) {
        const filter = parseChannelInput(input);
        const data = await request("channels", { part: "snippet,contentDetails", ...filter }, signal);
        const item = data.items?.[0];
        if (!item || !CHANNEL_ID.test(item.id)) throw new Error("Channel not found. Check the link or @handle.");
        const uploadsId = item.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsId) throw new Error("This channel has no public uploads feed.");
        const snippet = item.snippet || {};
        return {
            channelId: item.id,
            title: snippet.title || "YouTube channel",
            handle: snippet.customUrl || "",
            thumb: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
            uploadsId,
            url: `https://www.youtube.com/channel/${item.id}`
        };
    }

    async function recentVideos(channel, { signal, force = false } = {}) {
        const cached = cache.get(channel.channelId);
        if (!force && cached && Date.now() - cached.time < config.cacheMs) return cached.videos;
        const data = await request("playlistItems", {
            part: "snippet,contentDetails", playlistId: channel.uploadsId, maxResults: String(limit)
        }, signal);
        const seen = new Set();
        const videos = (data.items || []).flatMap(item => {
            const snippet = item.snippet || {};
            const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId;
            if (!VIDEO_ID.test(videoId || "") || seen.has(videoId) ||
                ["Private video", "Deleted video"].includes(snippet.title)) return [];
            seen.add(videoId);
            return [{
                videoId, channelId: channel.channelId, channelTitle: channel.title,
                title: snippet.title || "YouTube video",
                thumb: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
                publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || "",
                url: `https://www.youtube.com/watch?v=${videoId}`
            }];
        }).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
        cache.set(channel.channelId, { time: Date.now(), videos });
        return videos;
    }

    return { resolveChannel, recentVideos, clearCache: () => cache.clear() };
}
