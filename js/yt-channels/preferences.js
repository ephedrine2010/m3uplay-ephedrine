// Pure ordering helpers; legacy records keep their original newest-added order.
export function compareChannels(a, b) {
    const aOrdered = Number.isFinite(a.position);
    const bOrdered = Number.isFinite(b.position);
    if (aOrdered && bOrdered && a.position !== b.position) return a.position - b.position;
    if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
    const added = channel => channel.addedAt?.toMillis?.() || 0;
    return added(b) - added(a) || a.channelId.localeCompare(b.channelId);
}

export function arrangeChannels(channels, ids) {
    const byId = new Map(channels.map(channel => [channel.channelId, channel]));
    if (ids.length !== channels.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) {
        throw new Error("The channel list changed. Please try reordering it again.");
    }
    return ids.map((id, position) => ({ ...byId.get(id), position }));
}
