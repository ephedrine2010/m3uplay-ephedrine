// ============================================================================
//  dom.js — a tiny declarative element builder shared by the board's render
//  modules. Keeps card/tile/band construction readable top-to-bottom instead of
//  a pile of createElement/append calls.
// ============================================================================

// el("div", { class:"x", onclick:fn, text:"hi" }, [childNode, "string"])
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v == null) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "style") node.style.cssText = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
            node.setAttribute(k, v);
        }
    }
    for (const c of [].concat(children)) {
        if (c == null || c === false) continue;
        node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
}
