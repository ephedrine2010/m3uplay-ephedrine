import { el } from "../trends_board/dom.js";
import { channelIdentity } from "./view.js";

export function createChannelDialog({ mount, resolveChannel, onAdd, exists }) {
    const dialog = el("dialog", { class: "yc-dialog", "aria-labelledby": "yc-dialog-title" });
    const input = el("input", { id: "yc-channel-input", placeholder: "https://youtube.com/@ChannelName",
        autocomplete: "off", required: "", maxlength: "500" });
    const preview = el("div", { class: "yc-preview" });
    const status = el("p", { class: "yc-dialog-status", role: "status", "aria-live": "polite" });
    const find = el("button", { type: "submit", class: "ghost", text: "Find channel" });
    const add = el("button", { type: "button", text: "Add channel" });
    const cancel = el("button", { type: "button", class: "ghost", text: "Cancel", onclick: () => dialog.close() });
    const form = el("form", {}, [
        el("h3", { id: "yc-dialog-title", text: "Add YouTube channel" }),
        el("label", { for: input.id, text: "Channel link or @handle" }), input,
        el("div", { class: "yc-find" }, [find]), preview, status,
        el("p", { class: "yc-muted", text: "Show the latest 12 videos on your page." }),
        el("div", { class: "modal-actions" }, [cancel, add])
    ]);
    dialog.append(form);
    mount.append(dialog);
    let channel = null;
    let request = null;
    let saving = false;

    function resetPreview() {
        request?.abort();
        request = null;
        channel = null;
        preview.replaceChildren();
        status.textContent = "";
        add.disabled = true;
        find.disabled = false;
        find.textContent = "Find channel";
    }
    input.addEventListener("input", resetPreview);
    // A queued close event from a previous opening must not cancel a new lookup.
    dialog.addEventListener("close", () => { if (!dialog.open) resetPreview(); });
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    dialog.addEventListener("click", event => {
        if (event.target !== dialog || saving) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (saving) return;
        resetPreview();
        const currentRequest = request = new AbortController();
        find.disabled = true;
        find.textContent = "Finding…";
        status.textContent = "Finding channel…";
        try {
            const result = await resolveChannel(input.value, { signal: currentRequest.signal });
            if (currentRequest.signal.aborted || !dialog.open) return;
            channel = result;
            preview.replaceChildren(channelIdentity(channel));
            const duplicate = exists(channel.channelId);
            status.textContent = duplicate ? "This channel is already on your page." : "Check the channel above, then add it.";
            add.disabled = duplicate;
        } catch (error) {
            if (!currentRequest.signal.aborted) status.textContent = error.message;
        } finally {
            if (request === currentRequest) { find.disabled = false; find.textContent = "Find channel"; }
        }
    });
    add.addEventListener("click", async () => {
        if (!channel || saving) return;
        saving = true;
        add.disabled = find.disabled = cancel.disabled = input.disabled = true;
        add.textContent = "Adding…";
        try {
            await onAdd(channel);
            dialog.close();
        } catch (error) { status.textContent = error.message; }
        finally {
            saving = false;
            input.disabled = cancel.disabled = find.disabled = false;
            add.textContent = "Add channel";
            add.disabled = !channel || exists(channel.channelId);
        }
    });
    return {
        open() { resetPreview(); input.value = ""; dialog.showModal(); input.focus(); },
        close() { dialog.close(); }
    };
}
