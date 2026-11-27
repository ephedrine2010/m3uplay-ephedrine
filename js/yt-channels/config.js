// Public browser key: restrict it to this website AND YouTube Data API v3.
// Keep it separate from the Firebase key. The old trends YT_API_KEY is unused.
// Keep apiKey empty in Git. The Pages workflow injects YT_BROWSER_API_KEY into
// an artifact copy at deployment time. See README.md for setup/local use.
export const youtubeChannelsConfig = {
    apiKey: "",
    videoLimit: 12,
    cacheMs: 10 * 60 * 1000
};
