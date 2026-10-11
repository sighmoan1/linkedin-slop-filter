// Only explicitly selected post identifiers are stored, as hashes without text or URLs.
export const POST_EXCEPTIONS_KEY = "postExceptions";
export const MAX_POST_EXCEPTIONS = 500;
export function postIdentity(value) {
  if (typeof value !== "string" || !/^urn:li:(activity|share|ugcPost):[0-9]{1,30}$/.test(value)) throw new Error("This post has no stable identifier. Show post remains temporary.");
  return value;
}
export function normalizePostExceptions(value) {
  const records = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    if (item && /^[a-f0-9]{64}$/.test(item.id) && Number.isFinite(item.at) && item.at > 0) records.set(item.id,{id:item.id,at:item.at});
  }
  return [...records.values()].slice(-MAX_POST_EXCEPTIONS);
}
