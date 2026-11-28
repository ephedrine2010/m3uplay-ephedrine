import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The browser app intentionally has no package.json or Node module configuration.
const source = await readFile(new URL("../api.js", import.meta.url), "utf8");
const { parseChannelInput, parsePlaylistInput, createYouTubeApi } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const channelId = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
const channel = { channelId, title: "A channel", uploadsId: "UU_x5XG1OV2P6uZZ5FSM9Ttw" };
const config = { apiKey: "fixture-key", videoLimit: 12, cacheMs: 600000 };
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

test("channel links, handles, IDs and legacy usernames resolve to precise filters", () => {
    assert.deepEqual(parseChannelInput(" @GoogleDevelopers "), { forHandle: "@GoogleDevelopers" });
    assert.deepEqual(parseChannelInput("youtube.com/@GoogleDevelopers/videos?view=0"), { forHandle: "@GoogleDevelopers" });
    assert.deepEqual(parseChannelInput("https://m.youtube.com/@%D9%85%D9%88%D8%B3%D9%8A%D9%82%D9%89"), { forHandle: "@موسيقى" });
    assert.deepEqual(parseChannelInput(`https://www.youtube.com/channel/${channelId}/videos`), { id: channelId });
    assert.deepEqual(parseChannelInput(channelId), { id: channelId });
    assert.deepEqual(parseChannelInput("https://youtube.com/user/Google"), { forUsername: "Google" });
});

test("rejects foreign hosts, credentials, video links and unsupported custom links", () => {
    for (const input of ["", "some words", "https://youtube.com.evil.test/@foo", "https://evil.test/youtube.com/@foo",
        "https://user:pass@youtube.com/@foo", "https://youtube.com:4430/@foo", "https://youtube.com/watch?v=12345678901",
        "https://youtu.be/12345678901", "https://youtube.com/c/foo", "https://youtube.com/@bad%2Fhandle", "https://youtube.com/@%ZZ"]) {
        assert.throws(() => parseChannelInput(input), undefined, input);
    }
});

test("uses channels.list and the returned uploads playlist", async () => {
    let request;
    const api = createYouTubeApi(config, async url => {
        request = new URL(url);
        return reply({ items: [{ id: channelId, snippet: { title: "Real title", customUrl: "@real", thumbnails: { medium: { url: "https://example.test/avatar" } } },
            contentDetails: { relatedPlaylists: { uploads: "actual-uploads-id" } } }] });
    });
    const result = await api.resolveChannel("@real");
    assert.equal(request.pathname, "/youtube/v3/channels");
    assert.equal(request.searchParams.get("forHandle"), "@real");
    assert.equal(result.uploadsId, "actual-uploads-id");
    assert.equal(result.url, `https://www.youtube.com/channel/${channelId}`);
});

test("the reported channel URLs are sent as exact YouTube handle lookups", async () => {
    const handles = [];
    const api = createYouTubeApi(config, async url => {
        handles.push(new URL(url).searchParams.get("forHandle"));
        return reply({ items: [{ id: channelId, snippet: { title: "Resolved channel" },
            contentDetails: { relatedPlaylists: { uploads: channel.uploadsId } } }] });
    });
    await api.resolveChannel("https://www.youtube.com/@SharkTankEgypt");
    await api.resolveChannel("https://www.youtube.com/@NagdyWP");
    assert.deepEqual(handles, ["@SharkTankEgypt", "@NagdyWP"]);
});

test("missing keys identify incomplete setup without making a lookup request", async () => {
    for (const apiKey of ["", "   ", undefined]) {
        const api = createYouTubeApi({ ...config, apiKey }, () => assert.fail("must not contact YouTube without a key"));
        await assert.rejects(api.resolveChannel("https://www.youtube.com/@SharkTankEgypt"), /not been set up by the app owner/);
    }
});

test("credential, API enablement and website restriction failures stay distinct from channel-not-found", async () => {
    for (const [reason, expected] of [
        ["keyInvalid", /invalid or expired/], ["keyExpired", /invalid or expired/],
        ["API_KEY_INVALID", /invalid or expired/], ["API_KEY_HTTP_REFERRER_BLOCKED", /website address/],
        ["accessNotConfigured", /not enabled or allowed/], ["SERVICE_DISABLED", /not enabled or allowed/],
        ["API_KEY_SERVICE_BLOCKED", /not enabled or allowed/]
    ]) {
        const data = reason === reason.toUpperCase()
            ? { error: { errors: [{ reason: "forbidden" }], details: [{ reason }] } }
            : { error: { errors: [{ reason }] } };
        const api = createYouTubeApi(config, async () => reply(data, 403));
        await assert.rejects(api.resolveChannel("@NagdyWP"), expected);
    }
});

test("normalizes uploads by video publication date, filters unavailable items, deduplicates and caches", async () => {
    let requests = 0;
    const item = (videoId, date, title = videoId) => ({ snippet: { title, publishedAt: "2030-01-01", resourceId: { videoId } },
        contentDetails: { videoId, videoPublishedAt: date } });
    const api = createYouTubeApi(config, async url => {
        requests++;
        const parsed = new URL(url);
        assert.equal(parsed.pathname, "/youtube/v3/playlistItems");
        assert.equal(parsed.searchParams.get("maxResults"), "12");
        assert.equal(parsed.searchParams.get("playlistId"), channel.uploadsId);
        return reply({ items: [item("aaaaaaaaaaa", "2026-11-20"), item("bbbbbbbbbbb", "2026-11-26"),
            item("bbbbbbbbbbb", "2026-11-26"), item("ccccccccccc", "2026-11-27", "Private video"),
            item("ddddddddddd", "2026-11-27", "Deleted video"), item("invalid", "2026-11-27")] });
    });
    const videos = await api.recentVideos(channel);
    assert.deepEqual(videos.map(video => video.videoId), ["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    assert.equal(videos[0].publishedAt, "2026-11-26");
    assert.equal(videos[0].channelId, channelId);
    await api.recentVideos(channel);
    assert.equal(requests, 1);
    await api.recentVideos(channel, { force: true });
    assert.equal(requests, 2);
    api.clearCache();
    await api.recentVideos(channel);
    assert.equal(requests, 3);
});

test("handles missing config, empty channels, quota failures, network errors and cancellation", async () => {
    const missing = createYouTubeApi({ ...config, apiKey: "" }, () => assert.fail("must not request without key"));
    await assert.rejects(missing.resolveChannel("@real"), /not been set up/);
    const empty = createYouTubeApi(config, async () => reply({ items: [] }));
    await assert.rejects(empty.resolveChannel("@missing"), /not found/);
    const quota = createYouTubeApi(config, async () => reply({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403));
    await assert.rejects(quota.recentVideos(channel), /daily request limit/);
    const network = createYouTubeApi(config, async () => { throw new TypeError("network"); });
    await assert.rejects(network.recentVideos(channel), /Check your connection/);
    const controller = new AbortController();
    controller.abort();
    const cancelled = createYouTubeApi(config, async (_url, options) => {
        assert.equal(options.signal.aborted, true);
        throw new DOMException("aborted", "AbortError");
    });
    await assert.rejects(cancelled.recentVideos(channel, { signal: controller.signal }), { name: "AbortError" });
});

const playlistId = "PLfixture_playlist_123";
test("playlist URLs accept share and Music links while rejecting foreign hosts and single videos", () => {
    for (const input of [`https://youtube.com/playlist?list=${playlistId}`, `music.youtube.com/playlist?list=${playlistId}`,
        `https://youtu.be/aaaaaaaaaaa?list=${playlistId}`, `https://youtube.com/watch?v=aaaaaaaaaaa&list=${playlistId}&index=4`]) {
        assert.equal(parsePlaylistInput(input), playlistId);
    }
    for (const input of ["", "https://youtube.com/watch?v=aaaaaaaaaaa", "https://youtube.com.evil.test/playlist?list=" + playlistId,
        "https://user:pass@youtube.com/playlist?list=" + playlistId, "https://youtube.com:444/playlist?list=" + playlistId,
        "https://youtube.com/playlist?list=RDaaaaaaaaaaa", "https://youtube.com/playlist?list=WL"]) {
        assert.throws(() => parsePlaylistInput(input), undefined, input);
    }
});

test("imports every page in playlist order, retaining repeats and video-owner metadata", async () => {
    const requests = [];
    const item = (id, title = id) => ({ snippet: { title, videoOwnerChannelTitle: "Video creator", channelTitle: "Playlist curator",
        thumbnails: { medium: { url: "https://example.test/thumb.jpg" } } }, contentDetails: { videoId: id } });
    const api = createYouTubeApi(config, async input => {
        const url = new URL(input); requests.push(url);
        if (url.pathname.endsWith("/playlists")) return reply({ items: [{ snippet: { title: "A playlist" }, contentDetails: { itemCount: 5 } }] });
        assert.equal(url.searchParams.get("maxResults"), "50");
        assert.equal(url.searchParams.get("playlistId"), playlistId);
        if (!url.searchParams.has("pageToken")) return reply({ nextPageToken: "second", items: [item("bbbbbbbbbbb"), item("aaaaaaaaaaa")] });
        assert.equal(url.searchParams.get("pageToken"), "second");
        return reply({ items: [item("bbbbbbbbbbb"), item("ccccccccccc", "Private video"), item("ddddddddddd", "Deleted video")] });
    });
    const playlist = await api.resolvePlaylist(`https://youtube.com/playlist?list=${playlistId}`);
    assert.equal(requests.length, 3);
    assert.equal(playlist.title, "A playlist");
    assert.equal(playlist.playlistId, playlistId);
    assert.equal(playlist.skipped, 2);
    assert.deepEqual(playlist.tracks.map(track => track.name), ["bbbbbbbbbbb", "aaaaaaaaaaa", "bbbbbbbbbbb"]);
    assert.equal(playlist.tracks[0].channelTitle, "Video creator");
    assert.equal(playlist.tracks[0].thumb, "https://example.test/thumb.jpg");
});

test("private, empty, oversized and incomplete playlists fail without a partial import", async () => {
    const link = `https://youtube.com/playlist?list=${playlistId}`;
    const privateApi = createYouTubeApi(config, async () => reply({ error: { errors: [{ reason: "playlistItemsNotAccessible" }] } }, 403));
    await assert.rejects(privateApi.resolvePlaylist(link), /unavailable or private/);
    const missing = createYouTubeApi(config, async () => reply({ items: [] }));
    await assert.rejects(missing.resolvePlaylist(link), /unavailable or private/);
    const empty = createYouTubeApi(config, async () => reply({ items: [{ snippet: { title: "Empty" } }] }));
    await assert.rejects(empty.resolvePlaylist(link), /no available videos/);
    const large = createYouTubeApi(config, async () => reply({ items: [{ contentDetails: { itemCount: 501 } }] }));
    await assert.rejects(large.resolvePlaylist(link), /up to 500/);
    const repeatedToken = createYouTubeApi(config, async input => new URL(input).pathname.endsWith("/playlists")
        ? reply({ items: [{ snippet: { title: "Loop" } }] }) : reply({ nextPageToken: "same", items: [] }));
    await assert.rejects(repeatedToken.resolvePlaylist(link), /complete playlist/);
    const controller = new AbortController();
    const cancelled = createYouTubeApi(config, async input => {
        assert.ok(new URL(input).pathname.endsWith("/playlists"));
        controller.abort();
        return reply({ items: [{ snippet: { title: "Cancelled" } }] });
    });
    await assert.rejects(cancelled.resolvePlaylist(link, { signal: controller.signal }), { name: "AbortError" });
});
