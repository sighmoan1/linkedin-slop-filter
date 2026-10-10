// Observed signed-in LinkedIn feed tabs. A post-detail URL is not a feed.
export const FEED_PATHS = Object.freeze([
  "/feed", "/feed/", "/feed/foryou", "/feed/foryou/", "/feed/network", "/feed/network/"
]);

export function isFeedUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://www.linkedin.com" && !url.username && !url.password && FEED_PATHS.includes(url.pathname);
  } catch { return false; }
}
