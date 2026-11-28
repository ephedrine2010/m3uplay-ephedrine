import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../playlist-order.js", import.meta.url), "utf8");
const { comparePlaylists, arrangePlaylists } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("legacy libraries stay alphabetical and saved positions apply to every playlist type", () => {
    const manual = { id: "manual", name: "Alpha", tracks: [] };
    const youtube = { id: "youtube", name: "Zulu", source: "youtube", tracks: [] };
    const m3u = { id: "m3u", name: "Middle", tracks: [] };
    assert.deepEqual([youtube, manual, m3u].sort(comparePlaylists).map(item => item.id), ["manual", "m3u", "youtube"]);
    const ordered = arrangePlaylists([manual, youtube, m3u], ["youtube", "manual", "m3u"]);
    assert.deepEqual([ordered[2], { id: "new", name: "A new list" }, ordered[0], ordered[1]].sort(comparePlaylists).map(item => item.id),
        ["youtube", "manual", "m3u", "new"]);
});

test("library reordering retains imported metadata and leaves the previous state available for rollback", () => {
    const tracks = [{ name: "Video", url: "https://youtu.be/aaaaaaaaaaa", thumb: "https://example.test/art", channelTitle: "Creator" }];
    const playlists = [{ id: "manual", name: "Manual", tracks: [] },
        { id: "yt", name: "Imported", source: "youtube", sourceUrl: "https://youtube.com/playlist?list=PLfixture123", youtubePlaylistId: "PLfixture123", tracks }];
    const arranged = arrangePlaylists(playlists, ["yt", "manual"]);
    assert.deepEqual(arranged.map(item => item.position), [0, 1]);
    assert.equal(arranged[0].tracks, tracks);
    assert.equal(arranged[0].youtubePlaylistId, playlists[1].youtubePlaylistId);
    assert.equal(arranged[0].sourceUrl, playlists[1].sourceUrl);
    assert.equal(playlists[0].position, undefined);
});

test("stale, partial, duplicate and foreign library orders cannot remove playlists", () => {
    const playlists = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }];
    for (const ids of [["a"], ["a", "a"], ["a", "other-user"], ["a", "b", "c"]]) {
        assert.throws(() => arrangePlaylists(playlists, ids), /playlist library changed/);
    }
});
