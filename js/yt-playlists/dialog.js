import { el } from "../trends_board/dom.js";

export function createPlaylistImportDialog({ mount, resolvePlaylist, onImport }) {
    const input = el("input", { id: "yt-playlist-url", placeholder: "https://www.youtube.com/playlist?list=…", required: "", maxlength: "1000" });
    const name = el("input", { id: "yt-playlist-name", maxlength: "150" });
    const preview = el("div", { class: "yt-playlist-preview" });
    const status = el("p", { class: "yc-dialog-status", role: "status", "aria-live": "polite" });
    const find = el("button", { type: "submit", class: "ghost", text: "Preview" });
    const save = el("button", { type: "button", text: "Import", disabled: "" });
    const cancel = el("button", { type: "button", class: "ghost", text: "Cancel", onclick: () => dialog.close() });
    const details = el("div", { hidden: "" }, [
        preview, el("label", { for: name.id, text: "Name in your library" }), name,
        el("p", { class: "yc-muted", text: "Create an editable copy. You can add, remove or reorder tracks here." })
    ]);
    const form = el("form", {}, [
        el("h3", { id: "yt-playlist-title", text: "Add YouTube playlist" }),
        el("label", { for: input.id, text: "Playlist link" }), input,
        el("div", { class: "yc-find" }, [find]), details, status,
        el("div", { class: "modal-actions" }, [cancel, save])
    ]);
    const dialog = el("dialog", { id: "yt-playlist-dialog", class: "yc-dialog", "aria-labelledby": "yt-playlist-title" }, [form]);
    mount.append(dialog);
    let playlist = null;
    let request = null;
    let saving = false;

    function reset() {
        request?.abort();
        request = null;
        playlist = null;
        details.hidden = true;
        preview.replaceChildren();
        status.textContent = "";
        save.disabled = true;
        find.disabled = false;
        find.textContent = "Preview";
    }
    input.addEventListener("input", reset);
    dialog.addEventListener("close", () => { if (!dialog.open) reset(); });
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    dialog.addEventListener("click", event => {
        if (event.target !== dialog || saving) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (saving) return;
        reset();
        const current = request = new AbortController();
        find.disabled = true;
        find.textContent = "Loading…";
        status.textContent = "Loading playlist…";
        try {
            const result = await resolvePlaylist(input.value, { signal: current.signal });
            if (current.signal.aborted || !dialog.open) return;
            playlist = result;
            name.value = result.title;
            preview.append(el("strong", { text: result.title }), el("p", { text: `${result.tracks.length} videos` }));
            details.hidden = false;
            status.textContent = result.skipped ? `${result.skipped} unavailable videos will be skipped.` : "Ready to import.";
            save.disabled = false;
        } catch (error) {
            if (!current.signal.aborted) status.textContent = error.message;
        } finally {
            if (request === current) { find.disabled = false; find.textContent = "Preview"; }
        }
    });
    save.addEventListener("click", async () => {
        if (!playlist || saving) return;
        if (!name.value.trim()) { name.focus(); status.textContent = "Enter a playlist name."; return; }
        saving = true;
        for (const control of [input, name, find, save, cancel]) control.disabled = true;
        save.textContent = "Importing…";
        try {
            await onImport({ ...playlist, title: name.value.trim() });
            dialog.close();
        } catch (error) { status.textContent = error.message; }
        finally {
            saving = false;
            for (const control of [input, name, find, cancel]) control.disabled = false;
            save.disabled = !playlist;
            save.textContent = "Import";
        }
    });
    return {
        open() { reset(); input.value = ""; dialog.showModal(); input.focus(); },
        close() { request?.abort(); dialog.close(); }
    };
}
