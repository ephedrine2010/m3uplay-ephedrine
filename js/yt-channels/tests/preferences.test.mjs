import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../preferences.js", import.meta.url), "utf8");
const { compareChannels, arrangeChannels } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const channel = (channelId, added, preferences = {}) => ({ channelId, addedAt: { toMillis: () => added }, ...preferences });

test("legacy channels retain newest-added ordering until a custom order is saved", () => {
    const channels = [channel("older", 10), channel("newer", 20), channel("oldest", 5)];
    assert.deepEqual([...channels].sort(compareChannels).map(item => item.channelId), ["newer", "older", "oldest"]);
});

test("custom ordering persists independently of collapse state and new channels can be inserted first", () => {
    const channels = [channel("a", 100, { collapsed: true }), channel("b", 200), channel("c", 50)];
    const arranged = arrangeChannels(channels, ["c", "a", "b"]);
    assert.deepEqual(arranged.map(item => item.position), [0, 1, 2]);
    assert.equal(arranged[1].collapsed, true);
    assert.equal(channels[0].position, undefined, "the previous state stays available for rollback");
    const shuffled = [arranged[2], channel("new", 300, { position: -1 }), arranged[0], arranged[1]];
    assert.deepEqual(shuffled.sort(compareChannels).map(item => item.channelId), ["new", "c", "a", "b"]);
});

test("stale, partial or duplicate reorders cannot drop channels from the account", () => {
    const channels = [channel("a", 10), channel("b", 20)];
    for (const ids of [["a"], ["a", "a"], ["a", "missing"], ["a", "b", "c"]]) {
        assert.throws(() => arrangeChannels(channels, ids), /channel list changed/);
    }
});
