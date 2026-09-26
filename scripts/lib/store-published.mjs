import { readFileSync } from "node:fs";

const readConst = (source, name) => {
  const match = new RegExp(`export const ${name} = ([\\s\\S]*?) as const;`).exec(source);
  if (!match) throw new Error(`[gen-store] published ${name} missing; full refresh required`);
  return JSON.parse(match[1]);
};

/** The committed public artifact is the allowlist, never a source of new attribution. */
export function readPublishedStore(path) {
  const source = readFileSync(path, "utf8");
  const published = Object.fromEntries(
    ["storeApps", "fleet", "liveClients", "delisted", "pastClients", "fleetStats", "lastShipped"]
      .map((name) => [name, readConst(source, name)]),
  );
  // Not wrapped `as const` (a plain date literal), so a separate read: a
  // published-only run keeps this as the last FULL mine's date and stamps
  // storeVerifiedAt instead, rather than overwriting it with today.
  published.storeGeneratedAt = /export const storeGeneratedAt = "([^"]+)";/.exec(source)?.[1] ?? null;
  const ids = [...published.storeApps, ...published.fleet].map((app) => app.id);
  if (ids.length !== new Set(ids).size || ids.length !== published.fleetStats.live + published.storeApps.length) {
    throw new Error("[gen-store] published IDs/count disagree; full refresh required");
  }
  return published;
}

/** A 404 is real delisting evidence, but changing attribution needs the private source. */
export function assertPublishedListings(published, store, unresolved) {
  const ids = [...published.storeApps, ...published.fleet].map((app) => app.id);
  const missing = ids.filter((id) => !store[id]?.live || !store[id]?.name);
  if (unresolved.length || missing.length) {
    throw new Error(
      `[gen-store] published-only stopped: ${unresolved.length} unknown, ` +
      `${missing.length} missing/delisted (${missing.join(", ")}). ` +
      "Public files unchanged; run a full provenance-aware refresh locally.",
    );
  }
}
