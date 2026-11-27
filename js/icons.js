// Static outline Tabler glyphs. Names and paths are code-owned, never user data.
const paths = {
    music: 'M6 17V5l12-2v12M6 8l12-2M6 17a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm12-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
    home: 'm3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',
    list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    plus: 'M12 5v14M5 12h14',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
    download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
    moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v1m0 18v1M2 12h1m18 0h1M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
    chevron: 'm6 9 6 6 6-6',
    left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6',
    grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    refresh: 'M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m-6 0h6v6',
    play: 'm8 5 11 7-11 7Z', pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    external: 'M10 6H5v14h14v-5M14 4h6v6m0-6L10 14',
    x: 'm6 6 12 12M6 18 18 6', menu: 'M4 6h16M4 12h16M4 18h16',
    up: 'M12 19V5m-6 6 6-6 6 6', down: 'M12 5v14m-6-6 6 6 6-6',
    trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V3h6v4',
    chart: 'M4 19V9m5 10V5m5 14v-7m5 7V3',
    signout: 'M9 5H4v14h5m5-11 4 4-4 4m-6-4h10',
    check: 'm5 12 4 4L19 6'
};

export function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'app-icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name] || paths.music);
    if (name === 'grip' || name === 'more') path.setAttribute('stroke-width', '3.5');
    svg.append(path);
    return svg;
}

export function iconText(node, name, text = '') {
    node.replaceChildren(icon(name));
    if (text) {
        const label = document.createElement('span'); label.textContent = text; node.append(label);
    }
    return node;
}
