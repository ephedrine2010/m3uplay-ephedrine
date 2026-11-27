// Dependency-free Chromium integration test. All real app modules execute;
// only auth, database transport, metadata responses and the iframe SDK are fixtures.
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const chrome = process.env.CHROME_PATH || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
].find(existsSync);
if (!chrome) throw new Error("Chrome/Edge not found. Set CHROME_PATH to its executable.");
const profile = await mkdtemp(join(tmpdir(), "m3u-yt-browser-"));

const databaseFixture = `
export const getFirestore = () => ({});
export const collection = (_db, name) => ({ name });
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, condition) => ({ ...ref, condition });
export const doc = (_db, name, id) => ({ name, id });
export const serverTimestamp = () => Date.now();
const initial = { playlist1: { owner: 'user1', name: 'Saved playlist', tracks: [
    { name: 'Blocked song', url: 'https://youtu.be/bbbbbbbbbbb' },
    { name: 'Playable song', url: 'https://youtu.be/aaaaaaaaaaa' }
] } };
window.__db = JSON.parse(localStorage.getItem('fixture-db') || JSON.stringify(initial));
const persist = () => localStorage.setItem('fixture-db', JSON.stringify(window.__db));
export async function getDocs(ref) {
    const docs = Object.entries(window.__db).filter(([, value]) => value[ref.condition.field] === ref.condition.value)
        .map(([id, value]) => ({ id, data: () => ({ ...value, addedAt: value.addedAt ? { toMillis: () => value.addedAt } : null }) }));
    return { docs, forEach: cb => docs.forEach(cb) };
}
export async function setDoc(ref, value) {
    if (window.__failSave) throw new Error('fixture write failure');
    window.__db[ref.id] = value; persist();
}
export async function deleteDoc(ref) {
    if (window.__failDelete) throw new Error('fixture delete failure');
    delete window.__db[ref.id]; persist();
}
export async function addDoc(ref, value) { const id = 'new-playlist'; await setDoc({ ...ref, id }, value); return { id }; }
export async function updateDoc(ref, value) {
    if ('collapsed' in value && window.__failLayout) throw new Error('fixture layout failure');
    await setDoc(ref, { ...window.__db[ref.id], ...value });
}
export function writeBatch() {
    const updates = [];
    return {
        update(ref, value) { updates.push([ref, value]); },
        async commit() {
            if (window.__failLayout) throw new Error('fixture layout failure');
            for (const [ref] of updates) if (!window.__db[ref.id]) throw new Error('fixture missing document');
            for (const [ref, value] of updates) window.__db[ref.id] = { ...window.__db[ref.id], ...value };
            window.__layoutWrites = (window.__layoutWrites || 0) + 1;
            persist();
        }
    };
}
`;

const bootstrap = `
const checks = [];
window.__pageErrors = [];
window.addEventListener('error', event => window.__pageErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__pageErrors.push(String(event.reason)));
const originalFetch = window.fetch.bind(window);
const channelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
const anotherId = 'UCaaaaaaaaaaaaaaaaaaaaaa';
window.__blocked = new Set();
window.__ytInstances = [];
window.__apiRequests = 0;
window.fetch = async (input, options = {}) => {
    if (!String(input).startsWith('https://www.googleapis.com/youtube/v3/')) return originalFetch(input, options);
    window.__apiRequests++;
    const url = new URL(input);
    if (url.pathname.endsWith('/channels')) {
        const id = url.searchParams.get('forHandle') === '@another' ? anotherId : channelId;
        return new Response(JSON.stringify({ items: [{ id, snippet: { title: id === anotherId ? 'Another Channel' : 'Fixture Channel', customUrl: id === anotherId ? '@another' : '@fixture' },
            contentDetails: { relatedPlaylists: { uploads: id === anotherId ? 'UUanother' : 'UUfixture' } } }] }));
    }
    if (window.__delayFeed) await new Promise(resolve => setTimeout(resolve, 150));
    if (window.__quotaFailure) return new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 });
    const id = url.searchParams.get('playlistId') === 'UUanother' ? anotherId : channelId;
    return new Response(JSON.stringify({ items: [
        { snippet: { title: 'Older video', thumbnails: { medium: { url: '/fixture-thumb.svg' } } }, contentDetails: { videoId: 'bbbbbbbbbbb', videoPublishedAt: '2026-11-20T00:00:00Z' } },
        { snippet: { title: '<b>Latest video</b>', thumbnails: { medium: { url: '/fixture-thumb.svg' } } }, contentDetails: { videoId: id === anotherId ? 'ccccccccccc' : 'aaaaaaaaaaa', videoPublishedAt: '2026-11-26T00:00:00Z' } }
    ] }));
};
class FixturePlayer {
    constructor(placeholder, options) {
        this.options = options; this.state = -1; this.destroyed = false;
        this.frame = document.createElement('iframe'); this.frame.id = placeholder.id;
        this.frame.title = 'YouTube video player'; this.frame.src = 'about:blank';
        placeholder.replaceWith(this.frame);
        window.__ytInstances.push(this);
        queueMicrotask(() => { if (!this.destroyed) options.events.onReady(); });
    }
    loadVideoById(id) {
        this.videoId = id;
        setTimeout(() => {
            if (this.destroyed) return;
            if (window.__blocked.has(id)) this.options.events.onError({ data: 150, target: this });
            else this.playVideo();
        }, 0);
    }
    playVideo() { this.state = 1; this.options.events.onStateChange({ data: 1, target: this }); }
    pauseVideo() { this.state = 2; this.options.events.onStateChange({ data: 2, target: this }); }
    stopVideo() { this.state = -1; }
    destroy() { this.destroyed = true; this.frame.remove(); }
    getVideoData() { return { video_id: this.videoId }; }
}
const fixtureYT = { Player: FixturePlayer, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 } };
window.YT = fixtureYT;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (predicate, message) => {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(10); }
    throw new Error('Timed out: ' + message);
};
const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const clickText = (parent, text) => {
    const element = [...parent.querySelectorAll('button, a, .pl-name')].find(node => node.textContent.trim() === text);
    if (!element) throw new Error('Missing control: ' + text);
    element.click(); return element;
};
const visible = element => !!element && !element.closest('.hidden') && getComputedStyle(element).display !== 'none';
const dialog = () => document.querySelector('.yc-dialog');
const addChannel = async handle => {
    clickText(document.querySelector('.yc-head'), '+ Add YouTube channel');
    const input = dialog().querySelector('input'); input.value = handle;
    input.dispatchEvent(new Event('input'));
    clickText(dialog(), 'Find channel');
    await waitFor(() => ![...dialog().querySelectorAll('button')].find(node => node.textContent === 'Add channel').disabled, 'channel preview');
    clickText(dialog(), 'Add channel');
    await waitFor(() => !dialog().open, 'channel saved');
    await waitFor(() => document.querySelectorAll('.yc-card').length > 0, 'video thumbnails');
};
try {
    await import('/js/app.js');
    const coordinator = await import('/js/player.js');
    await waitFor(() => visible(document.querySelector('#discovery-home')) && document.querySelectorAll('.tb-band').length === 2, 'home loaded');
    check(document.querySelector('#discovery-home').firstElementChild.id === 'yt-channels', 'channels appear before trends');
    check(!document.querySelector('#trends-board').textContent.match(/YouTube|Anghami|Spotify/), 'removed trend sources stay hidden even with an old snapshot');
    check(document.querySelector('.yc-status').textContent.includes('first'), 'empty channel list has an add prompt');
    const settings = (await import('/js/yt-channels/config.js')).youtubeChannelsConfig;
    const configuredKey = settings.apiKey;
    settings.apiKey = '';
    const requestsBeforeSetupCheck = window.__apiRequests;
    clickText(document.querySelector('.yc-head'), '+ Add YouTube channel');
    dialog().querySelector('input').value = 'https://www.youtube.com/@SharkTankEgypt';
    clickText(dialog(), 'Find channel');
    await waitFor(() => dialog().textContent.includes('not been set up'), 'missing YouTube setup message');
    check(window.__apiRequests === requestsBeforeSetupCheck, 'missing setup is explained without contacting YouTube or claiming the channel is missing');
    clickText(dialog(), 'Cancel');
    settings.apiKey = configuredKey;
    clickText(document.querySelector('.yc-head'), '+ Add YouTube channel');
    dialog().querySelector('input').value = '@fixture';
    clickText(dialog(), 'Find channel');
    await waitFor(() => ![...dialog().querySelectorAll('button')].find(node => node.textContent === 'Add channel').disabled, 'preview before save failure');
    window.__failSave = true;
    clickText(dialog(), 'Add channel');
    await waitFor(() => dialog().textContent.includes("Couldn't save"), 'save error message');
    check(dialog().open && document.querySelectorAll('.yc-channel').length === 0, 'failed saves keep the dialog open without adding a row');
    window.__failSave = false;
    clickText(dialog(), 'Add channel');
    await waitFor(() => !dialog().open && document.querySelectorAll('.yc-card').length === 2, 'save retry succeeds');
    check(document.querySelectorAll('.yc-channel').length === 1, 'channel appears after adding');
    check(document.querySelectorAll('.yc-card').length === 2, 'recent videos render as thumbnail cards');
    check(document.querySelector('.yc-card').textContent.includes('<b>Latest video</b>'), 'videos sort newest first and titles stay plain text');
    check(!document.querySelector('.yc-card b'), 'video title HTML is not executed');
    check(Object.values(window.__db).filter(value => value.kind === 'youtube-channel' && value.owner === 'user1').length === 1, 'channel is persisted under the account');
    const firestore = await import('/js/firestore.js');
    check((await firestore.listPlaylists('user1')).length === 1, 'channel documents stay out of playlist results');
    const requestCount = window.__apiRequests;
    const apiModule = await import('/js/yt-channels/api.js');
    check(apiModule.parseChannelInput('@fixture').forHandle === '@fixture', 'actual browser API module loads');

    clickText(document.querySelector('.yc-head'), '+ Add YouTube channel');
    dialog().querySelector('input').value = 'youtube.com/@fixture/videos';
    clickText(dialog(), 'Find channel');
    await waitFor(() => dialog().textContent.includes('already on your page'), 'duplicate resolution');
    check([...dialog().querySelectorAll('button')].find(node => node.textContent === 'Add channel').disabled, 'duplicate handles and links cannot be added');
    clickText(dialog(), 'Cancel');
    check(!dialog().open, 'cancel closes the native dialog');

    await addChannel('@another');
    check(document.querySelectorAll('.yc-channel').length === 2 && document.querySelector('.yc-channel').textContent.includes('Another Channel'), 'new channels appear first');
    clickText(document.querySelector('.yc-channel'), 'Refresh');
    await waitFor(() => document.querySelectorAll('.yc-card').length === 4, 'refreshed videos');
    check(window.__apiRequests > requestCount, 'refresh requests current uploads');

    const rowFor = id => [...document.querySelector('.yc-rows').children].find(row => row.dataset.channelId === id);
    const order = () => [...document.querySelector('.yc-rows').children].map(row => row.dataset.channelId);
    const savedChannel = id => Object.values(window.__db).find(value => value.channelId === id);
    const waitLayout = () => waitFor(() => !document.querySelector('.yc-collapse').disabled, 'channel layout saved');
    const originalRail = rowFor(anotherId).querySelector('.tb-rail');
    rowFor(anotherId).querySelector('.yc-collapse').click();
    check(rowFor(anotherId).querySelector('.yc-channel-body').hidden &&
        rowFor(anotherId).querySelector('.yc-collapse').getAttribute('aria-expanded') === 'false', 'collapse hides videos while keeping the header accessible');
    await waitLayout();
    check(savedChannel(anotherId).collapsed === true, 'collapsed state is saved to the account');
    rowFor(anotherId).querySelector('.yc-collapse').click(); await waitLayout();
    check(!rowFor(anotherId).querySelector('.yc-channel-body').hidden, 'expand restores the video row');
    check(rowFor(anotherId).querySelector('.tb-rail') === originalRail, 'collapse and expand preserve the existing video rail');
    window.__failLayout = true;
    rowFor(anotherId).querySelector('.yc-collapse').click(); await waitLayout();
    check(!rowFor(anotherId).querySelector('.yc-channel-body').hidden && !savedChannel(anotherId).collapsed,
        'failed collapse saves restore the previous layout');
    window.__failLayout = false;

    rowFor(anotherId).querySelector('summary').click();
    clickText(rowFor(anotherId), 'Move down'); await waitLayout();
    check(order().join() === [channelId, anotherId].join() && savedChannel(channelId).position === 0 && savedChannel(anotherId).position === 1,
        'menu moves save the complete order atomically');
    rowFor(channelId).querySelector('.yc-drag-handle').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await waitLayout();
    check(order().join() === [anotherId, channelId].join() && document.activeElement === rowFor(channelId).querySelector('.yc-drag-handle'),
        'keyboard arrow keys reorder rows and retain focus');
    window.__failLayout = true;
    clickText(rowFor(anotherId), 'Move down'); await waitLayout();
    check(order().join() === [anotherId, channelId].join() && savedChannel(anotherId).position === 0,
        'failed batch saves restore the previous order without partial writes');
    window.__failLayout = false;

    const pointer = (target, type, y, pointerType = 'mouse', pointerId = 51) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: 30, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
        pointerType, pointerId, isPrimary: true
    }));
    const dragBelow = (id, targetId, pointerType = 'mouse', cancel = false) => {
        const rows = document.querySelector('.yc-rows');
        const handle = rowFor(id).querySelector('.yc-drag-handle');
        const y = handle.getBoundingClientRect().top + 12;
        const writes = window.__layoutWrites || 0;
        pointer(handle, 'pointerdown', y, pointerType);
        pointer(rows, 'pointermove', y + 8, pointerType);
        const endY = rowFor(targetId).getBoundingClientRect().bottom + 12;
        pointer(rows, 'pointermove', endY, pointerType);
        check((window.__layoutWrites || 0) === writes, 'drag preview does not save before drop (' + pointerType + ')');
        pointer(rows, cancel ? 'pointercancel' : 'pointerup', endY, pointerType);
    };
    dragBelow(anotherId, channelId); await waitLayout();
    check(order().join() === [channelId, anotherId].join() && savedChannel(channelId).position === 0 && !document.querySelector('.yc-drag-ghost'),
        'mouse drag reorders rows, saves on drop and removes its preview');
    dragBelow(channelId, anotherId, 'touch'); await waitLayout();
    check(order().join() === [anotherId, channelId].join(), 'touch drag can reorder channel rows');
    const writesBeforeCancel = window.__layoutWrites;
    dragBelow(anotherId, channelId, 'touch', true);
    check(order().join() === [anotherId, channelId].join() && window.__layoutWrites === writesBeforeCancel,
        'cancelled drags restore the previous order without a write');
    const dragHandle = rowFor(anotherId).querySelector('.yc-drag-handle');
    const dragStart = dragHandle.getBoundingClientRect().top + 10;
    pointer(dragHandle, 'pointerdown', dragStart);
    pointer(document.querySelector('.yc-rows'), 'pointermove', rowFor(channelId).getBoundingClientRect().bottom + 10);
    document.querySelector('.yc-rows').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(order().join() === [anotherId, channelId].join() && !document.querySelector('.yc-drag-ghost'), 'Escape cancels a row drag');

    const scrollHost = document.querySelector('#discovery-home');
    scrollHost.scrollTop = 0;
    const scrollHandle = rowFor(anotherId).querySelector('.yc-drag-handle');
    const scrollStart = scrollHandle.getBoundingClientRect().top + 10;
    pointer(scrollHandle, 'pointerdown', scrollStart);
    pointer(document.querySelector('.yc-rows'), 'pointermove', scrollHost.getBoundingClientRect().bottom - 2);
    await sleep(50);
    check(scrollHost.scrollTop > 0, 'dragging near the pane edge scrolls to reach other channel rows');
    pointer(document.querySelector('.yc-rows'), 'pointercancel', scrollStart);
    scrollHost.scrollTop = 0;

    window.__delayFeed = true;
    clickText(rowFor(anotherId), 'Refresh');
    const waitingHandle = rowFor(anotherId).querySelector('.yc-drag-handle');
    const waitingStart = waitingHandle.getBoundingClientRect().top + 10;
    pointer(waitingHandle, 'pointerdown', waitingStart);
    pointer(document.querySelector('.yc-rows'), 'pointermove', waitingStart + 10);
    await sleep(200);
    check(!!document.querySelector('.yc-drag-ghost') && waitingHandle.isConnected,
        'a feed response does not replace the row during a drag');
    pointer(document.querySelector('.yc-rows'), 'pointercancel', waitingStart);
    window.__delayFeed = false;
    await waitFor(() => document.querySelectorAll('.yc-card').length === 4, 'deferred feed rendered after drag');
    check(order().join() === [anotherId, channelId].join(), 'deferred feed rendering preserves the cancelled drag order');

    rowFor(anotherId).querySelector('.yc-collapse').click(); await waitLayout();
    await window.__authCallback(null);
    await window.__authCallback({ uid: 'user1', email: 'first@example.test' });
    await waitFor(() => document.querySelectorAll('.yc-card').length === 4, 'layout restored after sign-in');
    check(order().join() === [anotherId, channelId].join() && rowFor(anotherId).querySelector('.yc-channel-body').hidden,
        'custom order and collapse preferences survive a new account session');
    rowFor(anotherId).querySelector('.yc-collapse').click(); await waitLayout();

    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    await waitFor(() => coordinator.isPlaying(), 'embedded playback');
    check(document.querySelector('#yt-widget').parentElement.classList.contains('yc-player-slot'), 'the shared YouTube engine plays inside the large panel');
    check(document.querySelectorAll('#yt-player').length === 1, 'there is only one YouTube player');
    check(document.querySelector('.yc-player').open && document.querySelector('.yc-player').matches(':modal'), 'thumbnail playback opens a native modal popup');
    check(document.querySelector('[data-video-id="aaaaaaaaaaa"]').getAttribute('aria-pressed') === 'true', 'the current video card is highlighted');
    clickText(document.querySelector('.yc-player-meta'), 'Pause');
    check(!coordinator.isPlaying() && document.querySelector('#player-toggle').textContent === 'Play', 'panel pause synchronizes the bottom transport');
    clickText(document.querySelector('#player-bar'), 'Play');
    check(coordinator.isPlaying(), 'bottom transport resumes the same video');
    const instances = window.__ytInstances.length;
    document.querySelector('[data-video-id="ccccccccccc"]').click();
    await waitFor(() => coordinator.isPlaying() && coordinator.currentTrack()?.videoId === 'ccccccccccc', 'another video plays');
    check(window.__ytInstances.length === instances, 'switching thumbnails reuses the same player');

    window.__blocked.add('bbbbbbbbbbb');
    document.querySelector('[data-video-id="bbbbbbbbbbb"]').click();
    await waitFor(() => visible(document.querySelector('.yc-fallback')), 'blocked embed fallback');
    check(document.querySelector('.yc-fallback').textContent.includes('creator'), 'embedding failure has a clear explanation');
    check(document.querySelector('.yc-watch').href.endsWith('v=bbbbbbbbbbb') && document.querySelector('.yc-watch').target === '_blank', 'fallback opens the exact video in a new tab');
    check(!coordinator.isPlaying(), 'blocked playback pauses without automatic navigation');
    const oldPlayer = window.__ytInstances.at(-1);
    document.querySelector('.yc-player-head button').click();
    check(!visible(document.querySelector('.yc-player')) && coordinator.playingIndex() === -1, 'close stops the video and hides its panel');

    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    await waitFor(() => coordinator.isPlaying(), 'playback before Escape');
    oldPlayer.options.events.onError({ data: 150, target: oldPlayer });
    check(coordinator.isPlaying() && !visible(document.querySelector('.yc-fallback')), 'events from a destroyed iframe cannot interrupt a reopened player');
    document.querySelector('.yc-player').dispatchEvent(new Event('cancel', { cancelable: true }));
    check(!document.querySelector('.yc-player').open && coordinator.playingIndex() === -1, 'Escape closes the popup and stops playback');
    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    await waitFor(() => coordinator.isPlaying(), 'playback before backdrop click');
    document.querySelector('.yc-player').dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1, bubbles: true }));
    check(!document.querySelector('.yc-player').open && coordinator.playingIndex() === -1, 'clicking the backdrop closes the popup and stops playback');

    delete window.YT;
    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    document.querySelector('.yc-player-head button').click();
    window.YT = fixtureYT; window.onYouTubeIframeAPIReady();
    await sleep(20);
    check(coordinator.playingIndex() === -1 && !coordinator.isPlaying(), 'a late iframe SDK cannot restart a closed video');

    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    await waitFor(() => coordinator.isPlaying(), 'channel playback before switching');
    clickText(document.querySelector('#playlist-list'), 'Saved playlist');
    check(!visible(document.querySelector('#discovery-home')) && !coordinator.isPlaying(), 'opening a playlist stops and hides channel playback');
    clickText(document.querySelector('#topbar'), '▶ Play all');
    await waitFor(() => coordinator.isPlaying() && coordinator.currentTrack()?.name === 'Playable song', 'mixed playlist auto-skip');
    check(coordinator.currentTrack().name === 'Playable song', 'saved playlists still skip blocked videos');
    window.__blocked.add('aaaaaaaaaaa');
    coordinator.playAt(0);
    await waitFor(() => coordinator.playingIndex() === -1, 'all-unplayable guard');
    check(!coordinator.isPlaying(), 'an entirely unplayable repeated playlist stops');
    window.__blocked.clear();
    document.querySelector('#brand').click();
    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    await waitFor(() => coordinator.isPlaying(), 'channel playback after playlist');
    const last = window.__ytInstances.at(-1);
    last.options.events.onStateChange({ data: 0, target: last });
    check(coordinator.playingIndex() === -1, 'channel video ends without repeating');
    clickText(document.querySelector('.yc-player-meta'), 'Play');
    await waitFor(() => coordinator.isPlaying(), 'replay after end');
    check(coordinator.currentTrack().videoId === 'aaaaaaaaaaa', 'play after the end restarts the selected video');

    const fixtureRow = [...document.querySelectorAll('.yc-channel')].find(row => row.textContent.includes('Fixture Channel'));
    fixtureRow.querySelector('summary').click();
    clickText(fixtureRow, 'Remove channel');
    check(visible(document.querySelector('#confirm-modal')), 'removal requires confirmation');
    document.querySelector('#confirm-cancel').click();
    await sleep(10); // allow the pending confirmation handler to finish
    check(document.querySelectorAll('.yc-channel').length === 2, 'cancelled removal keeps the channel');
    window.__failDelete = true;
    clickText(fixtureRow, 'Remove channel'); document.querySelector('#confirm-ok').click();
    await sleep(20);
    check(document.querySelectorAll('.yc-channel').length === 2 && document.querySelector('#status').textContent.includes("Couldn't remove"), 'failed deletes preserve the row');
    window.__failDelete = false;
    clickText(fixtureRow, 'Remove channel'); document.querySelector('#confirm-ok').click();
    await waitFor(() => document.querySelectorAll('.yc-channel').length === 1, 'successful removal');
    check(!coordinator.isPlaying() && !visible(document.querySelector('.yc-player')), 'removing the current channel stops its playback');
    check(!Object.values(window.__db).some(value => value.channelId === channelId), 'confirmed removal is persisted');

    window.__quotaFailure = true;
    clickText(document.querySelector('.yc-channel'), 'Refresh');
    await waitFor(() => document.querySelector('.yc-feed-error'), 'quota error row');
    check(document.querySelector('.yc-feed-error').textContent.includes('daily request limit') && visible(document.querySelector('#trends-board')), 'a feed quota error leaves trends available');
    window.__quotaFailure = false;
    clickText(document.querySelector('.yc-channel'), 'Refresh');
    await waitFor(() => document.querySelectorAll('.yc-card').length === 2, 'quota retry');
    window.__delayFeed = true;
    clickText(document.querySelector('.yc-channel'), 'Refresh');
    await window.__authCallback(null);
    await window.__authCallback({ uid: 'user2', email: 'second@example.test' });
    await sleep(200);
    check(document.querySelectorAll('.yc-channel').length === 0, "late responses cannot expose another account's channels");
    await window.__authCallback(null);
    window.__delayFeed = false;
    await window.__authCallback({ uid: 'user1', email: 'first@example.test' });
    await waitFor(() => document.querySelectorAll('.yc-card').length === 2, 'saved channels restored');
    check(document.querySelector('.yc-channel').textContent.includes('Another Channel'), 'saved channels return after sign-out and sign-in');
    await addChannel('@fixture');
    document.querySelector('[data-video-id="aaaaaaaaaaa"]').click();
    await waitFor(() => coordinator.isPlaying(), 'final player layout');
    const home = document.querySelector('#discovery-home');
    check(document.querySelector('#app').scrollWidth <= window.innerWidth + 1,
        'app fits viewport (' + document.querySelector('#app').scrollWidth + '/' + window.innerWidth + ')');
    check(home.scrollWidth <= home.clientWidth + 1, 'channel rails do not widen the home pane');
    check(document.querySelector('.yc-player-slot').getBoundingClientRect().height >= 200, 'video viewport meets the minimum embed height');
    home.scrollTop = 0;
    if (${Boolean(process.env.YT_CHANNELS_SCREENSHOT)}) {
        document.querySelector('.yc-player-head button').click();
        rowFor(anotherId).querySelector('.yc-collapse').click(); await waitLayout();
        home.scrollTop = 0;
    }
    check(window.__pageErrors.length === 0, 'no uncaught page errors: ' + window.__pageErrors.join(', '));
    const result = document.createElement('pre'); result.id = 'test-result';
    result.textContent = JSON.stringify({ ok: true, checks }); document.body.append(result);
    window.parent.postMessage({ type: 'yt-channel-test', result: result.textContent }, '*');
} catch (error) {
    const result = document.createElement('pre'); result.id = 'test-result';
    result.textContent = JSON.stringify({ ok: false, error: error.stack, checks, pageErrors: window.__pageErrors });
    document.body.append(result);
    window.parent.postMessage({ type: 'yt-channel-test', result: result.textContent }, '*');
}
`;

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, "http://localhost");
        // Chrome's Windows headless window has a minimum layout width. A frame
        // gives the app the exact requested CSS viewport, including phone widths.
        if (url.pathname === "/__frame") {
            const [width, height] = (process.env.YT_CHANNELS_WINDOW_SIZE || "1280,900").split(",").map(Number);
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}iframe{display:block;border:0}</style></head><body>
                <iframe src="/" style="width:${width}px;height:${height}px"></iframe>
                <script>addEventListener('message', event => { if (event.data?.type !== 'yt-channel-test') return;
                const pre = document.createElement('pre'); pre.id = 'test-result'; pre.hidden = true;
                pre.textContent = event.data.result; document.body.append(pre); });</script></body></html>`);
            return;
        }
        if (url.pathname === "/__bootstrap.js") {
            response.setHeader("Content-Type", "text/javascript"); response.end(bootstrap); return;
        }
        if (url.pathname === "/__firestore.js") {
            response.setHeader("Content-Type", "text/javascript"); response.end(databaseFixture); return;
        }
        if (url.pathname === "/js/auth.js") {
            response.setHeader("Content-Type", "text/javascript");
            response.end(`export function watchAuth(callback) { window.__authCallback = callback; setTimeout(() => callback({ uid: 'user1', email: 'first@example.test' }), 0); }
                export async function signIn() { await window.__authCallback({ uid: 'user1', email: 'first@example.test' }); }
                export async function signOutUser() { await window.__authCallback(null); }`); return;
        }
        if (url.pathname === "/js/firebase.js") {
            response.setHeader("Content-Type", "text/javascript"); response.end("export const app = {};"); return;
        }
        if (url.pathname === "/fixture-thumb.svg") {
            response.setHeader("Content-Type", "image/svg+xml");
            response.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#27395c"/><text x="140" y="100" fill="white" font-size="32">▶</text></svg>'); return;
        }
        const file = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
        if (!file.startsWith(root + sep)) throw new Error("Outside test root");
        let body = await readFile(file);
        const extension = extname(file);
        response.setHeader("Content-Type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" }[extension] || "application/octet-stream");
        if (extension === ".js") body = body.toString().replaceAll("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js", "/__firestore.js");
        if (url.pathname === "/js/yt-channels/config.js") body = 'export const youtubeChannelsConfig = { apiKey: "fixture-key", videoLimit: 12, cacheMs: 600000 };';
        if (url.pathname === "/") body = body.toString().replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
            .replace("</body>", '<script type="module" src="/__bootstrap.js"></script></body>');
        if (url.pathname === "/data/trending.json") {
            const data = JSON.parse(body);
            data.sources.push({ id: "youtube", label: "YouTube", tile: true, tracks: [] },
                { id: "anghami", label: "Anghami", tile: true, tracks: [] }, { id: "spotify", label: "Spotify", tile: true, tracks: [] });
            body = JSON.stringify(data);
        }
        response.end(body);
    } catch { response.writeHead(404); response.end("Not found"); }
});

try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${server.address().port}/__frame`;
    const run = await new Promise((resolveRun, rejectRun) => {
        const screenshotArgs = process.env.YT_CHANNELS_SCREENSHOT ? [`--screenshot=${resolve(process.env.YT_CHANNELS_SCREENSHOT)}`] : [];
        const browserProcess = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--force-device-scale-factor=1",
            "--no-default-browser-check", "--disable-background-networking", "--disable-extensions",
            "--dump-dom", "--virtual-time-budget=12000", `--window-size=${process.env.YT_CHANNELS_WINDOW_SIZE || "1280,900"}`,
            `--user-data-dir=${profile}`, ...screenshotArgs, address], { windowsHide: true });
        let stdout = "", stderr = "";
        browserProcess.stdout.on("data", chunk => { stdout += chunk; });
        browserProcess.stderr.on("data", chunk => { stderr += chunk; });
        const timeout = setTimeout(() => { browserProcess.kill(); rejectRun(new Error("Browser test exceeded 45 seconds.")); }, 45000);
        browserProcess.on("error", error => { clearTimeout(timeout); rejectRun(error); });
        browserProcess.on("exit", code => { clearTimeout(timeout); resolveRun({ code, stdout, stderr }); });
    });
    assert.equal(run.code, 0, run.stderr.slice(-2000));
    const match = run.stdout.match(/<pre id="test-result"[^>]*>([\s\S]*?)<\/pre>/);
    assert.ok(match, "Browser produced no test result. DOM tail: " + run.stdout.slice(-3500) + "\n" + run.stderr.slice(-1500));
    const text = match[1].replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
    const result = JSON.parse(text);
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    console.log(`Browser integration passed: ${result.checks.length} checks.`);
    for (const check of result.checks) console.log(`  OK ${check}`);
} finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // The only recursive cleanup target is the exact temporary profile we created.
    if (dirname(resolve(profile)) !== resolve(tmpdir()) || !profile.includes("m3u-yt-browser-")) throw new Error("Unexpected profile cleanup path");
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}
