// Pointer gestures only. The app owns the order and saves once, on drop.
// A dedicated handle keeps vertical row dragging separate from video-rail panning.
export function enableListReorder({ rows, onReorder, onEnd = () => {},
    itemKey = "channelId", handleSelector = ".yc-drag-handle", rowSelector = ".yc-channel",
    previewSelector = ".yc-channel-head", scrollHostSelector = "#discovery-home", classPrefix = "yc" }) {
    let gesture = null;
    let frame = 0;
    const children = () => [...rows.children];
    const ids = () => children().map(row => row.dataset[itemKey]);

    function arrange(y) {
        const row = gesture.row;
        const target = children().find(candidate => candidate !== row &&
            y < candidate.getBoundingClientRect().top + candidate.getBoundingClientRect().height / 2);
        if (target) { if (row.nextElementSibling !== target) rows.insertBefore(row, target); }
        else if (rows.lastElementChild !== row) rows.append(row);
    }

    function animate() {
        if (!gesture?.moved) return;
        const host = rows.closest(scrollHostSelector);
        if (host) {
            const bounds = host.getBoundingClientRect();
            const top = Math.max(0, bounds.top);
            const bottom = Math.min(window.innerHeight, bounds.bottom);
            const distance = gesture.y < top + 48 ? gesture.y - top - 48
                : gesture.y > bottom - 48 ? gesture.y - bottom + 48 : 0;
            if (distance) {
                host.scrollTop += Math.max(-18, Math.min(18, distance / 3));
                arrange(gesture.y);
            }
        }
        frame = requestAnimationFrame(animate);
    }

    function finish(cancelled = false) {
        if (!gesture) return;
        const current = gesture;
        gesture = null;
        cancelAnimationFrame(frame);
        current.ghost?.remove();
        current.row.classList.remove(`${classPrefix}-row-dragging`);
        rows.classList.remove(`${classPrefix}-reordering`);
        if (rows.hasPointerCapture?.(current.pointerId)) rows.releasePointerCapture(current.pointerId);
        if (cancelled) {
            const nodes = new Map(children().map(row => [row.dataset[itemKey], row]));
            current.original.forEach(id => { if (nodes.has(id)) rows.append(nodes.get(id)); });
        }
        const order = ids();
        const changed = !cancelled && current.moved && order.some((id, index) => id !== current.original[index]);
        if (changed) {
            onReorder(order, current.row.dataset[itemKey]);
        }
        onEnd();
        if (!changed && current.row.isConnected) current.row.querySelector(handleSelector)?.focus({ preventScroll: true });
    }

    rows.addEventListener("pointerdown", event => {
        const handle = event.target.closest(handleSelector);
        if (!handle || handle.disabled || gesture || event.button !== 0 || event.isPrimary === false || children().length < 2) return;
        const row = handle.closest(rowSelector);
        gesture = { row, pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
            offset: event.clientY - row.getBoundingClientRect().top, original: ids(), moved: false };
        handle.focus({ preventScroll: true });
        event.preventDefault();
        // Capture on the stable container; rows themselves move during dragging.
        try { rows.setPointerCapture(event.pointerId); } catch { /* synthetic test events */ }
    });
    rows.addEventListener("pointermove", event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        gesture.y = event.clientY;
        if (!gesture.moved && Math.abs(event.clientY - gesture.startY) < 6) return;
        event.preventDefault();
        if (!gesture.moved) {
            gesture.moved = true;
            rows.querySelectorAll(".yc-menu[open]").forEach(menu => { menu.open = false; });
            const bounds = gesture.row.getBoundingClientRect();
            const ghost = (previewSelector ? gesture.row.querySelector(previewSelector) : gesture.row).cloneNode(true);
            ghost.classList.add(`${classPrefix}-drag-ghost`);
            ghost.setAttribute("aria-hidden", "true");
            ghost.inert = true;
            ghost.style.left = `${bounds.left}px`;
            ghost.style.width = `${bounds.width}px`;
            document.body.append(ghost);
            gesture.ghost = ghost;
            gesture.row.classList.add(`${classPrefix}-row-dragging`);
            rows.classList.add(`${classPrefix}-reordering`);
            animate(); // scroll immediately at an edge, then continue each frame
        }
        gesture.ghost.style.top = `${event.clientY - Math.min(gesture.offset, 42)}px`;
        arrange(event.clientY);
    });
    rows.addEventListener("pointerup", event => {
        if (gesture?.pointerId === event.pointerId) finish();
    });
    rows.addEventListener("pointercancel", event => {
        if (gesture?.pointerId === event.pointerId) finish(true);
    });
    rows.addEventListener("lostpointercapture", event => {
        if (gesture?.pointerId === event.pointerId) finish(true);
    });
    rows.addEventListener("keydown", event => {
        if (event.key === "Escape" && gesture) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
        if (gesture) return;
        const handle = event.target.closest(handleSelector);
        if (!handle || handle.disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const order = ids();
        const id = handle.closest(rowSelector).dataset[itemKey];
        const from = order.indexOf(id);
        const to = from + (event.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        onReorder(order, id);
    });
    return { isActive: () => !!gesture, cancel: () => finish(true) };
}

// Preserve the channel feature's existing interface and gesture defaults.
export function enableChannelReorder(options) { return enableListReorder(options); }
