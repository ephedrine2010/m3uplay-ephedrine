// Pointer gestures only. The app owns the order and saves once, on drop.
// A dedicated handle keeps vertical row dragging separate from video-rail panning.
export function enableChannelReorder({ rows, onReorder, onEnd }) {
    let gesture = null;
    let frame = 0;
    const children = () => [...rows.children];
    const ids = () => children().map(row => row.dataset.channelId);

    function arrange(y) {
        const row = gesture.row;
        const target = children().find(candidate => candidate !== row &&
            y < candidate.getBoundingClientRect().top + candidate.getBoundingClientRect().height / 2);
        if (target) { if (row.nextElementSibling !== target) rows.insertBefore(row, target); }
        else if (rows.lastElementChild !== row) rows.append(row);
    }

    function animate() {
        if (!gesture?.moved) return;
        const host = rows.closest("#discovery-home");
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
        current.row.classList.remove("yc-row-dragging");
        rows.classList.remove("yc-reordering");
        if (rows.hasPointerCapture?.(current.pointerId)) rows.releasePointerCapture(current.pointerId);
        if (cancelled) {
            const nodes = new Map(children().map(row => [row.dataset.channelId, row]));
            current.original.forEach(id => { if (nodes.has(id)) rows.append(nodes.get(id)); });
        }
        const order = ids();
        const changed = !cancelled && current.moved && order.some((id, index) => id !== current.original[index]);
        if (changed) {
            onReorder(order, current.row.dataset.channelId);
        }
        onEnd();
        if (!changed && current.row.isConnected) current.row.querySelector(".yc-drag-handle")?.focus({ preventScroll: true });
    }

    rows.addEventListener("pointerdown", event => {
        const handle = event.target.closest(".yc-drag-handle");
        if (!handle || handle.disabled || gesture || event.button !== 0 || event.isPrimary === false || children().length < 2) return;
        const row = handle.closest(".yc-channel");
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
            const ghost = gesture.row.querySelector(".yc-channel-head").cloneNode(true);
            ghost.classList.add("yc-drag-ghost");
            ghost.setAttribute("aria-hidden", "true");
            ghost.inert = true;
            ghost.style.left = `${bounds.left}px`;
            ghost.style.width = `${bounds.width}px`;
            document.body.append(ghost);
            gesture.ghost = ghost;
            gesture.row.classList.add("yc-row-dragging");
            rows.classList.add("yc-reordering");
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
        if (event.key === "Escape" && gesture) { event.preventDefault(); finish(true); return; }
        if (gesture) return;
        const handle = event.target.closest(".yc-drag-handle");
        if (!handle || handle.disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const order = ids();
        const id = handle.closest(".yc-channel").dataset.channelId;
        const from = order.indexOf(id);
        const to = from + (event.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        onReorder(order, id);
    });
    return { isActive: () => !!gesture, cancel: () => finish(true) };
}
