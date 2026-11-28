// Unordered libraries keep their existing alphabetical order until rearranged.
export function comparePlaylists(a, b) {
    const aOrdered = Number.isFinite(a.position);
    const bOrdered = Number.isFinite(b.position);
    if (aOrdered && bOrdered && a.position !== b.position) return a.position - b.position;
    if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "") || a.id.localeCompare(b.id);
}

export function arrangePlaylists(playlists, ids) {
    const byId = new Map(playlists.map(playlist => [playlist.id, playlist]));
    if (ids.length !== playlists.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) {
        throw new Error("The playlist library changed. Please try reordering it again.");
    }
    return ids.map((id, position) => ({ ...byId.get(id), position }));
}
