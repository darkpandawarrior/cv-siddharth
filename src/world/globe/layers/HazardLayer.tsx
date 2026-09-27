// LANE L7: live earth events — quakes, EONET wildfires/volcanoes/storms,
// GDACS alerts, the aurora oval and upcoming launches. This file is the
// integration point: it owns every fetch, every parse-once memo, the
// composite health line (task 6), and the one e2e data seam (task 11); the
// actual instancing lives in quakeGlyphs/eonetGlyphs/hazardHalos/
// auroraOval/launchMarkers.tsx.
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useLiveSignal, type LiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
import { useGlobe, type LayerHealth } from "../globeStore.ts";
import { parseQuakes, filterQuakesForTier, quakesAtTime, TIER_STATIC, QUAKE_POLL_MS } from "./quake.ts";
import { parseEonetEvents, eventsAtTime, EONET_POLL_MS } from "./eonet.ts";
import { parseGdacsAlerts, matchGdacsAlerts, GDACS_POLL_MS } from "./hazardAlerts.ts";
import { parseOvationGrid, parseLatestKp, AURORA_POLL_MS, KP_POLL_MS } from "./aurora.ts";
import { type Launch, parseLaunches, getCachedLaunches, setCachedLaunches } from "./launches.ts";
import { buildHazardStatus } from "./hazardStatus.ts";
import { QuakeGlyphs } from "./quakeGlyphs.tsx";
import { EonetGlyphs } from "./eonetGlyphs.tsx";
import { HazardHalos } from "./hazardHalos.tsx";
import { AuroraOval } from "./auroraOval.tsx";
import { LaunchMarkers } from "./launchMarkers.tsx";

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30";
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10";

// ponytail: EONET (~70 open events), GDACS (~90 orange/red) and Launch
// Library (capped at 10 by its own query) never approach a count where a
// per-tier reduction would change anything visible — each glyph file's own
// MAX_* constant is already the real ceiling. Quakes are the one feed that
// genuinely needs a tier-shaped filter (task 1's own T1/T2/T3 magnitude
// thresholds), so that's the only per-tier logic here. Add a real per-tier
// cap for the others if a future feed (a bad wildfire season, a major
// swarm of GDACS alerts) ever pushes their counts high enough to matter.

/** e2e-only read seam (task 11: "observable via a data attribute seam in
 *  your own files"), same convention as presenceGeo.ts's own
 *  `__GLOBE_PRESENCE_TEST__` global. A DOM-node seam (drei's `<Html>`, or a
 *  raw `createPortal`) was tried first and dropped: putting `<Html>` on
 *  both an eager path (Markers.tsx/LiveDots.tsx already use it) and this
 *  lazy one made Rollup fold a large, unrelated shared chunk into the eager
 *  "Globe" bundle (measured with `vite build` + `check-budget.mjs` against
 *  this lane's own worktree — see this lane's report). A plain global
 *  write costs nothing to bundle. Inspector.tsx (L5) isn't built yet, so
 *  this mirrors `selected` for this lane's own e2e spec rather than
 *  depending on another lane's stub. */
declare global {
  interface Window {
    __HAZARD_DEBUG__?: {
      quakes: number;
      fires: number;
      storms: number;
      volcanoes: number;
      alerts: number;
      launches: number;
      aurora: boolean;
      selectedKind: string;
      selectedRows: { label: string; value: string }[] | null;
      status: LayerHealth;
    };
  }
}

/** `snap.error` means the last poll failed — parse `null` rather than the
 *  possibly-stale cached `snap.data` useLiveSignal keeps around: this house
 *  never shows a stale value dressed as live. Memoized on the raw payload
 *  (not on every render) since `parse` allocates a fresh array each call. */
function useParsedFeed<T>(snap: LiveSignalSnapshot<unknown>, parse: (json: unknown) => T | null): T | null {
  return useMemo(() => (snap.error ? null : parse(snap.data)), [snap.data, snap.error, parse]);
}

export default function HazardLayer({ now, tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const live = useGlobe((s) => s.timeOffsetMin === 0);
  const selected = useGlobe((s) => s.selected);
  const setStatus = useGlobe((s) => s.setStatus);
  const reducedMotion = useReducedMotion();
  const simNowMs = now.getTime();
  const staticTier = TIER_STATIC[tier] || reducedMotion; // task 8 + house motion rule: a looping ripple is exactly what reduced motion forbids

  const quakesRaw = useLiveSignal<unknown>(QUAKES_URL, QUAKE_POLL_MS);
  const eonetRaw = useLiveSignal<unknown>(EONET_URL, EONET_POLL_MS);
  const gdacsRaw = useLiveSignal<unknown>(GDACS_URL, GDACS_POLL_MS);
  const ovationRaw = useLiveSignal<unknown>(OVATION_URL, AURORA_POLL_MS);
  const kpRaw = useLiveSignal<unknown>(KP_URL, KP_POLL_MS);

  const quakesAll = useParsedFeed(quakesRaw, parseQuakes);
  const eonetAll = useParsedFeed(eonetRaw, parseEonetEvents);
  const gdacsAll = useParsedFeed(gdacsRaw, parseGdacsAlerts);
  const auroraGrid = useParsedFeed(ovationRaw, parseOvationGrid);
  const kpReading = useParsedFeed(kpRaw, parseLatestKp);

  const quakesLoading = quakesRaw.data === null && !quakesRaw.error;
  const eonetLoading = eonetRaw.data === null && !eonetRaw.error;
  const gdacsLoading = gdacsRaw.data === null && !gdacsRaw.error;
  const auroraLoading = ovationRaw.data === null && !ovationRaw.error;
  const kpLoading = kpRaw.data === null && !kpRaw.error;

  const quakesTiered = useMemo(() => (quakesAll ? filterQuakesForTier(quakesAll, tier) : []), [quakesAll, tier]);
  // Task 7: every time-aware layer draws only up to the simulated instant.
  // At `timeOffsetMin === 0` this is a no-op (real event times are never in
  // the simulated future), so there is no separate "live" branch to keep in
  // sync with this one.
  const quakesShown = useMemo(() => quakesAtTime(quakesTiered, simNowMs), [quakesTiered, simNowMs]);
  const eonetShown = useMemo(() => (eonetAll ? eventsAtTime(eonetAll, simNowMs) : []), [eonetAll, simNowMs]);

  const matchedAlerts = useMemo(
    () => (gdacsAll ? matchGdacsAlerts(gdacsAll, quakesAll ?? [], eonetAll ?? []) : []),
    [gdacsAll, quakesAll, eonetAll],
  );

  // Aurora is a nowcast (task 7: "hides unless offset is 0") — the grid has
  // no per-cell timestamp to filter by like a quake or an EONET event does,
  // so this is a hard gate rather than a time filter.
  const auroraShown = live ? auroraGrid : null;

  // Launches: fetched once per page load (LL2's own 15 req/hour ceiling),
  // cached in sessionStorage for 30 min so a remount or fast-refresh doesn't
  // re-spend a request.
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [launchesFailed, setLaunchesFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    async function run() {
      const nowMs = Date.now();
      const storage = typeof window === "undefined" ? null : window.sessionStorage;
      const cached = storage && getCachedLaunches(storage, nowMs);
      if (cached) {
        if (alive) setLaunches(cached);
        return;
      }
      try {
        const res = await fetch(LAUNCHES_URL);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const parsed = parseLaunches(json, nowMs);
        if (!parsed) throw new Error("malformed Launch Library feed");
        if (alive) setLaunches(parsed);
        if (storage) setCachedLaunches(storage, parsed, nowMs);
      } catch {
        if (alive) setLaunchesFailed(true);
      }
    }
    void run();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const fires = eonetShown.filter((e) => e.category === "wildfires").length;
    const storms = eonetShown.filter((e) => e.category === "severeStorms").length;
    const volcanoes = eonetShown.filter((e) => e.category === "volcanoes").length;
    const status = buildHazardStatus(
      {
        quakes: { ok: quakesAll !== null, value: quakesAll !== null ? { count: quakesShown.length } : null },
        eonet: { ok: eonetAll !== null, value: eonetAll !== null ? { fireCount: fires, stormCount: storms, volcanoCount: volcanoes } : null },
        gdacs: { ok: gdacsAll !== null, value: gdacsAll !== null ? { count: matchedAlerts.length } : null },
        aurora: { ok: auroraGrid !== null, value: auroraGrid !== null ? {} : null },
        kp: { ok: kpReading !== null, value: kpReading !== null ? { kp: kpReading.kp } : null },
        launches: { ok: launches !== null, value: launches !== null ? { count: launches.length } : null },
      },
      {
        quakes: quakesLoading,
        eonet: eonetLoading,
        gdacs: gdacsLoading,
        aurora: auroraLoading,
        kp: kpLoading,
        launches: launches === null && !launchesFailed,
      },
    );
    setStatus("hazards", status);
    if (typeof window !== "undefined") {
      window.__HAZARD_DEBUG__ = {
        quakes: quakesShown.length,
        fires,
        storms,
        volcanoes,
        alerts: matchedAlerts.length,
        launches: launches?.length ?? 0,
        aurora: auroraShown !== null,
        selectedKind: selected?.kind ?? "",
        selectedRows: selected?.rows ?? null,
        status,
      };
    }
  }, [
    quakesAll,
    quakesShown,
    quakesLoading,
    eonetAll,
    eonetShown,
    eonetLoading,
    gdacsAll,
    matchedAlerts,
    gdacsLoading,
    auroraGrid,
    auroraShown,
    auroraLoading,
    kpReading,
    kpLoading,
    launches,
    launchesFailed,
    selected,
    setStatus,
  ]);

  return (
    <>
      <QuakeGlyphs quakes={quakesShown} staticTier={staticTier} simNowMs={simNowMs} />
      <EonetGlyphs events={eonetShown} simNowMs={simNowMs} />
      <HazardHalos alerts={matchedAlerts} />
      <AuroraOval grid={auroraShown} now={now} reducedMotion={reducedMotion} />
      <LaunchMarkers launches={launches ?? []} now={now} />
    </>
  );
}
