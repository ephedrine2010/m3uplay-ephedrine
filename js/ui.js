// Appearance and drawer focus only. Account, playlist and media state stay in app.js.
import { iconText } from './icons.js';

const compact = matchMedia('(max-width: 800px)');
let drawerTrigger = null;
const byId = id => document.getElementById(id);

export function closeLibrary() {
    const sidebar = byId('sidebar');
    if (!sidebar.hasAttribute('data-open')) return;
    sidebar.removeAttribute('data-open');
    byId('library-scrim').hidden = true;
    byId('library-toggle').setAttribute('aria-expanded', 'false');
    byId('topbar').inert = byId('content').inert = byId('player-bar').inert = false;
    sidebar.inert = compact.matches;
    if (compact.matches && drawerTrigger?.isConnected) drawerTrigger.focus();
}

export function initUI() {
    document.querySelectorAll('[data-icon]').forEach(node => iconText(node, node.dataset.icon, node.dataset.label));
    let preference = null;
    try { preference = localStorage.getItem('m3u-appearance'); } catch { /* storage may be disabled */ }
    if (!['light', 'dark'].includes(preference)) preference = null;
    const system = matchMedia('(prefers-color-scheme: dark)');
    function applyAppearance(theme) {
        document.documentElement.dataset.theme = theme;
        const dark = theme === 'dark', toggle = byId('theme-toggle');
        iconText(toggle, dark ? 'sun' : 'moon');
        toggle.title = `Switch to ${dark ? 'light' : 'dark'} appearance`;
        toggle.setAttribute('aria-label', toggle.title);
        document.querySelector('meta[name="theme-color"]').content = dark ? '#101011' : '#f5f5f7';
    }
    applyAppearance(preference === 'light' || preference === 'dark' ? preference : system.matches ? 'dark' : 'light');
    byId('theme-toggle').addEventListener('click', () => {
        preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('m3u-appearance', preference); } catch { /* keep session choice */ }
        applyAppearance(preference);
    });
    system.addEventListener('change', () => { if (!preference) applyAppearance(system.matches ? 'dark' : 'light'); });
    function syncLayout() {
        closeLibrary(); byId('sidebar').inert = compact.matches;
    }
    compact.addEventListener('change', syncLayout); syncLayout();
    byId('library-toggle').addEventListener('click', event => {
        if (!compact.matches) return;
        drawerTrigger = event.currentTarget;
        byId('sidebar').inert = false; byId('sidebar').setAttribute('data-open', '');
        byId('library-scrim').hidden = false; drawerTrigger.setAttribute('aria-expanded', 'true');
        byId('topbar').inert = byId('content').inert = byId('player-bar').inert = true;
        byId('library-close').focus();
    });
    byId('library-close').addEventListener('click', closeLibrary);
    byId('library-scrim').addEventListener('click', closeLibrary);
    document.addEventListener('keydown', event => {
        if (!compact.matches || !byId('sidebar').hasAttribute('data-open') || document.querySelector('dialog[open]')) return;
        if (event.key === 'Escape') { event.preventDefault(); closeLibrary(); }
        if (event.key === 'Tab') {
            const controls = [...byId('sidebar').querySelectorAll('button, a, input')].filter(node => !node.disabled && node.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
}
