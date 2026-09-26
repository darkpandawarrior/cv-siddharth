import { useEffect, useState } from "react";
import { usePresence } from "@playhtml/react";

/**
 * GLOBE's live-presence read (S14, living-ledger-spec.md#9.1 and §6.3's
 * "Live dots"). A visitor's browser publishes `{ cc }` - a country code and
 * nothing else - on this channel, deliberately separate from Ghosts'
 * `world-drivers-v1` (which carries a live x/z position): a country is never
 * joined to a visitor's path. The UI renders counts per country only, and
 * the count vanishes the moment a tab closes - playhtml presence is
 * ephemeral, never written to page data (§9.1: "cumulative counts are not
 * kept in playhtml page data").
 */
export const GEO_CHANNEL = "geo-v1";
export type GeoPresence = { cc: string };

/**
 * e2e-only seam (G10: a required gate never hits a live network). playhtml's
 * presence document is a real shared room, keyed on hostname the same way
 * visitors.spec.ts's door counter is - its actual occupancy during a test run
 * is nobody's business and never deterministic. `e2e/globe.spec.ts` sets this
 * before navigating so "two mocked presences" is exactly that: mocked, not
 * whatever else happens to be in the room. Left undefined in production; the
 * hook falls through to the real channel whenever it is.
 */
declare global {
  interface Window {
    __GLOBE_PRESENCE_TEST__?: Record<string, number>;
  }
}

async function fetchOwnCountry(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl("/api/whereami");
    if (!res.ok) return null;
    const body = (await res.json()) as { country: string | null };
    return body.country;
  } catch {
    return null;
  }
}

/** Country code -> how many published presences (including this tab, once
 *  its own country has resolved) carry it. Pure aggregation, extracted from
 *  the hook below so it is testable without playhtml's own provider. */
export function countByCountry(presences: ReadonlyMap<string, Partial<GeoPresence>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of presences.values()) {
    if (p && typeof p.cc === "string" && p.cc) counts[p.cc] = (counts[p.cc] ?? 0) + 1;
  }
  return counts;
}

/** Fetches this tab's own edge-observed country once (`/api/whereami`, never
 *  polled - a visitor's country doesn't change mid-session), publishes it on
 *  `geo-v1` once known, and returns the live per-country counts across every
 *  tab on the channel right now. */
export function usePresenceGeo(): Record<string, number> {
  const { presences, setMyPresence } = usePresence<GeoPresence>(GEO_CHANNEL);
  const [cc, setCc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnCountry().then((code) => {
      if (!cancelled && code) setCc(code);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cc) setMyPresence({ cc });
  }, [cc, setMyPresence]);

  const testOverride = typeof window !== "undefined" ? window.__GLOBE_PRESENCE_TEST__ : undefined;
  return testOverride ?? countByCountry(presences);
}
