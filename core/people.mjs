// Explicit selections only; never retain a scraped directory of people.
export const PEOPLE_KEY = "neverHidePeople";
export const MAX_PEOPLE = 5000;
export function profileUrl(value) {
  try {
    const u = new URL(value);
    if (u.origin !== "https://www.linkedin.com" || u.username || u.password || !/^\/in\/[^/]+\/?$/.test(u.pathname)) return null;
    return u.origin + u.pathname.replace(/\/$/, "").toLowerCase();
  } catch { return null; }
}
export function isPeopleUrl(value) {
  try {
    const u = new URL(value);
    return u.origin === "https://www.linkedin.com" && !u.username && !u.password && [
      "/mynetwork/invite-connect/connections", "/mynetwork/network-manager/people-follow/following",
      "/mynetwork/network-manager/people-follow", "/mynetwork/network-manager/connections"
    ].includes(u.pathname.replace(/\/$/, ""));
  } catch { return false; }
}
export function normalizePeople(value) {
  const unique = new Map();
  if (Array.isArray(value)) for (const entry of value) {
    const url = profileUrl(entry?.url);
    if (url) unique.set(url, {url, name: typeof entry.name === "string" ? entry.name.trim().slice(0, 100) : ""});
  }
  return [...unique.values()].slice(0, MAX_PEOPLE);
}
