import { describe, expect, it } from "vitest";
import { readPublishedStore, assertPublishedListings } from "./store-published.mjs";

const published = readPublishedStore(new URL("../../src/data/store.ts", import.meta.url));
const live = Object.fromEntries(
  [...published.storeApps, ...published.fleet].map(({ id, name }) => [id, { live: true, name }]),
);

describe("published Store refresh gate", () => {
  it("uses only committed IDs and retains historical evidence", () => {
    expect(published.storeApps).toHaveLength(3);
    expect(published.fleet).toHaveLength(published.fleetStats.live);
    expect(published.delisted).toHaveLength(published.fleetStats.delisted);
    expect(published.pastClients).toHaveLength(published.fleetStats.clientsGone);
    expect(() => assertPublishedListings(published, live, [])).not.toThrow();
  });

  it("stops before public output for an unknown answer or confirmed 404", () => {
    const id = published.fleet[0].id;
    expect(() => assertPublishedListings(published, live, [id])).toThrow(/1 unknown/);
    expect(() => assertPublishedListings(published, { ...live, [id]: { live: false } }, [])).toThrow(/missing\/delisted/);
    expect(published.fleetStats.carryingHisCommits).toBeGreaterThan(0);
  });
});
