// Entries live in chrome.storage as "cache:<sha256 of the scoring key and text>" -> {s: {categoryId: probability}, t}.
// Only the hash and the scores are stored, never the post text.
export const CACHE_PREFIX = "cache:";
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_MAX = 2000;
const validScoreMap = s => !!s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length > 0 &&
  Object.values(s).every(p => typeof p === "number" && p >= 0 && p <= 1);
export const cacheFresh = (entry, now = Date.now()) =>
  !!entry && validScoreMap(entry.s) && typeof entry.t === "number" && now - entry.t < CACHE_TTL_MS && entry.t <= now + 60000;
// Which cache keys to delete: invalid or expired ones, then the oldest beyond the size cap.
export function cacheEvictions(all, now = Date.now(), max = CACHE_MAX) {
  const keys = Object.keys(all).filter(k => k.startsWith(CACHE_PREFIX));
  const stale = keys.filter(k => !cacheFresh(all[k], now));
  const live = keys.filter(k => cacheFresh(all[k], now)).sort((a, b) => all[a].t - all[b].t);
  return [...stale, ...live.slice(0, Math.max(0, live.length - max))];
}
