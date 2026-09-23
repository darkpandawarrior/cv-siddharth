// Listings can disappear or change ratings. Historical negative results remain
// cached; live evidence must be renewed before the shelf's 45-day deadline.
export const STORE_CACHE_MAX_AGE_MS = 30 * 86_400_000;

export function needsStoreProbe(entry, version, now = Date.now()) {
  if (!entry) return true;
  if (!entry.live) return false;
  const checkedAt = Date.parse(entry.checkedAt);
  return entry.v !== version || !Number.isFinite(checkedAt) ||
    checkedAt > now || now - checkedAt >= STORE_CACHE_MAX_AGE_MS;
}
