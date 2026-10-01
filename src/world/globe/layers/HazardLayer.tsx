import { setHazardKeys, resetHazardKeys } from "./layerKeys.ts";
import { startVisibilityPolling } from "../../../lib/visibilityPolling.ts";
import { VolcanoGlyphs } from "./VolcanoGlyphs.tsx";
import { parseVolcanoResponse, volcanoGlyphs } from "./volcano.ts";
// LANE L7: live earth events — quakes, EONET wildfires/volcanoes/storms,
// GDACS alerts, the aurora oval and upcoming launches. This file is the
// integration point: it owns every fetch, every parse-once memo, the
// composite health line (task 6), and the one e2e data seam (task 11); the
// actual instancing lives in quakeGlyphs/eonetGlyphs/hazardHalos/
// auroraOval/launchMarkers.tsx.
//
// LANE W12 ("Ask the globe") edit, scoped to exactly this: honouring
// `store.filters` (a "show quakes above 5" / "quakes this week" command) on
// top of this component's own tier-based magnitude floor, extending its
// existing __HAZARD_DEBUG__ e2e seam with the two fields that command's
// effect needs to verify (`topQuakes`, `filters`), and — because AskBox.tsx
// isn't mounted anywhere in this wave and this is the one W12-owned file
// that IS mounted — bootstrapping the copilot's own e2e seam behind
// `?globeTest=1` (see copilot/execute.ts's file-level comment).
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
import { setHazardSnapshot } from "./hazardSnapshot.ts"; // WAVE 6 LANE X6: minimal additive edit, see that file's own comment
import { publish } from "../feed.ts"; // WAVE 6 LANE X1 (live world feed)
import { QuakeGlyphs } from "./quakeGlyphs.tsx";
import { EonetGlyphs } from "./eonetGlyphs.tsx";
import { HazardHalos } from "./hazardHalos.tsx";
import { AuroraOval } from "./auroraOval.tsx";
import { LaunchMarkers } from "./launchMarkers.tsx";
// LANE V5 (wave 7, lane 5, step A): hurricane forecast cones.
import { type ConePolygon, matchConeToGdacs, NHC_POLL_MS, parseNhcCones } from "./nhcCones.ts";
import { NhcConeGlyphs } from "./nhcConeGlyphs.tsx";
import { QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL, NHC_CONE_LAYER_IDS, nhcConeUrl } from "./feedUrls.ts";

// W12: the e2e-only seam bootstrap, gated so a real visitor never pays for
// it (dynamic import -> its own chunk, fetched only when the flag is set).
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("globeTest") === "1") {
  void import("../copilot/execute.ts");
}

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
      /** W12 additions: the 5 largest quakes CURRENTLY DRAWN (post-tier,
       *  post-filter, post-time-scrub) and the filter that produced them —
       *  copilot/context.ts reads the former for the LLM's grounding
       *  snapshot; both exist here so the "quakes above 5" e2e case can
       *  assert on the same object the layer already exposes. */
      topQuakes: { place: string; mag: number }[];
      filters: { quakeMinMag?: number; quakeSinceHours?: number };
      /** V5: cones currently drawn, and this poll's own health -- "failed"
       *  means every one of the 15 sub-layer queries errored this round
       *  (see HazardLayer's own nhcStatus effect). */
      nhcCones: number;
      nhcStatus: "loading" | "live" | "failed";
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
  const filters = useGlobe((s) => s.filters); // W12: "show quakes above 5" / "quakes this week"
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
  // W12: a visitor-set filter on top of the tier floor above — "show quakes
  // above 5" raises the magnitude floor further (never lowers it below the
  // tier's own cap, since `Math.max` picks the stricter of the two); "this
  // week" drops anything older than `quakeSinceHours` from the simulated
  // instant. Both are optional and compose independently.
  const quakesFiltered = useMemo(() => {
    const minMag = filters.quakeMinMag;
    const sinceHours = filters.quakeSinceHours;
    if (minMag === undefined && sinceHours === undefined) return quakesTiered;
    return quakesTiered.filter((q) => {
      if (minMag !== undefined && q.mag < minMag) return false;
      if (sinceHours !== undefined && simNowMs - q.timeMs > sinceHours * 3_600_000) return false;
      return true;
    });
  }, [quakesTiered, filters.quakeMinMag, filters.quakeSinceHours, simNowMs]);
  // Task 7: every time-aware layer draws only up to the simulated instant.
  // At `timeOffsetMin === 0` this is a no-op (real event times are never in
  // the simulated future), so there is no separate "live" branch to keep in
  // sync with this one.
  const quakesShown = useMemo(() => quakesAtTime(quakesFiltered, simNowMs), [quakesFiltered, simNowMs]);
  const volcanoSnap = useLiveSignal<unknown>("/api/volcanoes", 21600000);
  const weeklyVolcanoes = useMemo(() => volcanoSnap.error ? [] : (parseVolcanoResponse(volcanoSnap.data) ?? []), [volcanoSnap.data, volcanoSnap.error]);
  const weeklyGlyphs = useMemo(() => volcanoGlyphs(weeklyVolcanoes.filter((v) => v.at <= simNowMs)), [weeklyVolcanoes, simNowMs]);
  useEffect(() => {
    for (const v of weeklyVolcanoes) {
      if (v.at > simNowMs) continue;
      publish({ id: `gvp:${v.id}:${v.week}`, kind: "volcano", title: `${v.name} (${v.country})`, detail: `${v.week}: ${v.summary}`, whenMs: v.at, source: "Smithsonian GVP / USGS weekly report", live: false, severity: "warn", ...(v.lat !== null && v.lon !== null ? { focus: { kind: "latlon" as const, lat: v.lat, lon: v.lon } } : {}) });
    }
  }, [weeklyVolcanoes, simNowMs]);
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

  // V5: hurricane forecast cones (step A). Mounted only while
  // layers.hazards is on (GlobeScene.tsx's own Suspense gate), which is the
  // "when the layer is turned on" the brief asks for -- no separate toggle
  // needed here. The 15 cone sub-layers are queried in parallel every poll;
  // most answer an empty FeatureCollection (no storm in that slot) and that
  // is success, not failure -- "failed" means every single one of the 15
  // requests errored this round, not that most slots are quiet.
  const [nhcCones, setNhcCones] = useState<ConePolygon[]>([]);
  const [nhcStatus, setNhcStatus] = useState<"loading" | "live" | "failed">("loading");
  useEffect(() => {
    let alive = true;
    async function poll() {
      const results = await Promise.allSettled(
        NHC_CONE_LAYER_IDS.map(async (id) => {
          const res = await fetch(nhcConeUrl(id));
          if (!res.ok) throw new Error(String(res.status));
          return parseNhcCones(await res.json());
        }),
      );
      if (!alive) return;
      const cones: ConePolygon[] = [];
      let anyOk = false;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value !== null) {
          anyOk = true;
          cones.push(...r.value);
        }
      }
      setNhcCones(cones);
      setNhcStatus(anyOk ? "live" : "failed");
    }
    const stop = startVisibilityPolling(poll, NHC_POLL_MS);
    return () => {
      alive = false;
      stop();
    };
  }, []);

  // "matched to GDACS tropical-cyclone points by name or distance" -- used
  // only to pick the fill colour (a GDACS red alert draws the cone in the
  // house danger colour instead of the default warn one); the cone itself
  // is drawn regardless of whether a GDACS match exists.
  const nhcDangerIds = useMemo(() => {
    const set = new Set<string>();
    if (!gdacsAll) return set;
    for (const cone of nhcCones) {
      const m = matchConeToGdacs(cone, gdacsAll);
      if (m?.alertLevel === "red") set.add(cone.id);
    }
    return set;
  }, [nhcCones, gdacsAll]);

  // X6: refresh the snapshot every time the drawn sets change — same inputs
  // as the status effect below, kept separate so a sibling layer's read
  // never depends on this component's own debug-global bookkeeping.
  useEffect(() => {
    setHazardSnapshot({
      quakes: quakesShown.map((q) => ({ id: q.id, lat: q.lat, lon: q.lon, mag: q.mag })),
      fires: eonetShown.filter((e) => e.category === "wildfires").map((f) => ({ id: f.id, lat: f.lat, lon: f.lon })),
    });
  }, [quakesShown, eonetShown]);

  useEffect(() => {
    const fires = eonetShown.filter((e) => e.category === "wildfires").length;
    const storms = eonetShown.filter((e) => e.category === "severeStorms").length;
    const volcanoes = eonetShown.filter((e) => e.category === "volcanoes").length + weeklyGlyphs.length;
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
    // V5: fold the cone layer's own clause into the composite "hazards"
    // detail line (the only place LayerPanel.tsx renders per-layer detail
    // text, so no panel edit is needed) without touching hazardStatus.ts,
    // which this lane does not own. A failed NHC poll never flips the
    // whole "hazards" row to failed on its own -- the other five feeds can
    // still be live -- it only names itself as unreachable in the sentence,
    // same as buildHazardStatus already does per sub-feed.
    const nhcClause =
      nhcStatus === "failed" ? "NHC unreachable" : nhcCones.length > 0 ? `${nhcCones.length} NHC cones` : "No active NHC storms";
    const combinedStatus: LayerHealth = {
      state: status.state,
      detail: [status.detail, volcanoSnap.error ? "Smithsonian weekly report unreachable" : weeklyVolcanoes.length ? `Smithsonian GVP / USGS weekly report, ${weeklyVolcanoes[0].week}` : "Smithsonian weekly report loading", `${nhcClause}, NHC basins only (Atlantic, East and Central Pacific)`].filter(Boolean).join(", "),
    };
    setHazardKeys({ quakes: quakesShown.length, fires, storms, volcanoes, alerts: matchedAlerts.length,
      launches: launches?.length ?? 0, cones: nhcCones.length, aurora: auroraShown !== null, kp: kpReading?.kp ?? null });
    setStatus("hazards", combinedStatus);
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
        status: combinedStatus,
        // W12: top 5 by magnitude, from what's actually drawn (post-filter,
        // post-time-scrub) — copilot/context.ts's own grounding snapshot.
        topQuakes: [...quakesShown]
          .sort((a, b) => b.mag - a.mag)
          .slice(0, 5)
          .map((q) => ({ place: q.place, mag: q.mag })),
        filters,
        nhcCones: nhcCones.length,
        nhcStatus,
      };
    }
  }, [
    weeklyGlyphs,
    weeklyVolcanoes,
    volcanoSnap.error,
    quakesAll,
    quakesShown,
    quakesLoading,
    eonetAll,
    eonetShown,
    eonetLoading,
    gdacsAll,
    matchedAlerts,
    gdacsLoading,
    nhcCones,
    nhcStatus,
    auroraGrid,
    auroraShown,
    auroraLoading,
    kpReading,
    kpLoading,
    launches,
    launchesFailed,
    selected,
    setStatus,
    filters,
  ]);

  useEffect(() => resetHazardKeys, []);

  // WAVE 6 LANE X1 (live world feed): every qualifying item is published on
  // every poll, not just "the first time seen" — the feed store's own
  // de-dup by id (feed.ts) is what turns "still true on this poll" into
  // "announced once", so this effect never needs its own tracked-id set.
  // Kp is the one feed with no per-reading id upstream: its own `timeIso`
  // stands in, so a genuinely new reading (not just a re-poll of the same
  // one) is what actually changes the id and gets through the de-dup.
  useEffect(() => {
    for (const q of quakesShown) {
      if (q.mag < 4.5) continue;
      publish({
        id: `quake:${q.id}`,
        kind: "quake",
        title: `M${q.mag.toFixed(1)} ${q.place}`,
        detail: `${q.depthKm.toFixed(0)} km deep`,
        whenMs: q.timeMs,
        source: "USGS",
        live,
        focus: { kind: "latlon", lat: q.lat, lon: q.lon },
        severity: q.mag >= 6 ? "danger" : "warn",
      });
    }
    for (const e of eonetShown) {
      publish({
        id: `eonet:${e.id}`,
        kind: e.category === "wildfires" ? "wildfire" : e.category === "volcanoes" ? "volcano" : "storm",
        title: e.title,
        detail: e.category === "wildfires" ? "wildfire" : e.category === "volcanoes" ? "volcano" : "severe storm",
        whenMs: e.dateMs,
        source: "NASA EONET",
        live,
        focus: { kind: "latlon", lat: e.lat, lon: e.lon },
        severity: "warn",
      });
    }
    for (const a of matchedAlerts) {
      publish({
        id: `gdacs:${a.id}`,
        kind: "gdacs",
        title: a.name,
        detail: `${a.eventType} · ${a.alertLevel} alert`,
        whenMs: simNowMs, // GDACS carries no discrete event timestamp in this parse — stamped at first observation, then stable (de-dup keeps the id from ever re-publishing a later whenMs)
        source: "GDACS",
        live,
        focus: { kind: "latlon", lat: a.lat, lon: a.lon },
        severity: a.alertLevel === "red" ? "danger" : "warn",
      });
    }
    for (const l of launches ?? []) {
      if (!l.within24h) continue;
      publish({
        id: `launch:${l.id}`,
        kind: "launch",
        title: l.name,
        detail: `${l.provider} · ${l.padName}`,
        whenMs: l.netMs,
        source: "Launch Library 2",
        live,
        focus: { kind: "latlon", lat: l.lat, lon: l.lon },
        severity: "info",
      });
    }
    if (kpReading && kpReading.kp >= 5) {
      publish({
        id: `kp:${kpReading.timeIso}`,
        kind: "aurora",
        title: `Kp ${kpReading.kp.toFixed(2)}, geomagnetic storm`,
        detail: "aurora oval active",
        whenMs: Date.parse(kpReading.timeIso),
        source: "NOAA SWPC",
        live,
        severity: kpReading.kp >= 7 ? "danger" : "warn",
      });
    }
  }, [quakesShown, eonetShown, matchedAlerts, launches, kpReading, live, simNowMs]);

  return (
    <>
      <QuakeGlyphs quakes={quakesShown} staticTier={staticTier} simNowMs={simNowMs} />
      <VolcanoGlyphs rows={weeklyVolcanoes.filter((v) => v.at <= simNowMs)} />
      <EonetGlyphs events={eonetShown} simNowMs={simNowMs} />
      <HazardHalos alerts={matchedAlerts} />
      <AuroraOval grid={auroraShown} now={now} reducedMotion={reducedMotion} />
      <LaunchMarkers launches={launches ?? []} now={now} />
      <NhcConeGlyphs cones={nhcCones} dangerIds={nhcDangerIds} />
    </>
  );
}
