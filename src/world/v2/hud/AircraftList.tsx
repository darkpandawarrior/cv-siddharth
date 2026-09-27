/**
 * The Aircraft/Satellites ledger DOM (master-plan.md#P3-03 task 2:
 * "AircraftList expands the ledger row to one text line per aircraft
 * (accessibility)"; open-data-spec.md §8's Aircraft/Satellites rows).
 * Mounted through `layers.ts`'s `hud/*.tsx` glob; a DOM sibling of
 * `<Canvas>`, never a child of it; so it reads `/api/aircraft` and
 * `/api/tle` on its OWN subscription to the shared `useLiveSignal` bus
 * (P4: one fetch per URL, however many subscribers) rather than reaching
 * into `layers/SkyObjects.tsx`'s canvas tree, which this tree has no React
 * ancestor in common with (`layers.ts`'s own doc comment covers why canvas
 * and HUD layers mount through separate globs).
 *
 * `useSurveyLens()` is the same module-scope toggle `SkyObjects.tsx` reads,
 * so `useSatellites()` here mounts (and its own lazy `import()`) at exactly
 * the same moment the canvas layer's copy does; both on `L`, neither
 * before it.
 */
import { useMemo } from "react";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { useSatellites } from "../../../lib/useSatellites.ts";
import { useSurveyLens } from "../reality/SurveyLens.tsx";
import { aircraftDrawCountForTier } from "../reality/Aircraft.tsx";
import { deviceTier } from "../../deviceTier.ts";
import type { AircraftEntry, AircraftResponse } from "../../../../api/_lib/aircraft-handler.ts";

export const layer = { id: "aircraft-list", order: 55 };

const AIRCRAFT_POLL_MS = 30_000; // Aircraft.tsx's own cadence; same URL, same shared bus, no extra fetch

/** One accessible text line per aircraft (this lane's own accessibility
 *  task); plain English, no dashes (G8). */
function aircraftLine(a: AircraftEntry): string {
  const type = a.type ?? "unknown type";
  const alt = a.altFt != null ? `flight level ${Math.round(a.altFt / 100)}` : "altitude unknown";
  const speed = a.gsKt != null ? `${Math.round(a.gsKt)} knots` : "speed unknown";
  return `${a.cs}, ${type}, ${alt}, ${speed}, ${a.rangeKm.toFixed(0)} km from the Sangam`;
}

export default function AircraftList() {
  const { data } = useLiveSignal<AircraftResponse>("/api/aircraft", AIRCRAFT_POLL_MS);
  const lensOpen = useSurveyLens();
  const tier = useMemo(() => deviceTier(), []);

  const aircraft = data?.aircraft ?? [];
  // `data.total` (not a re-derived `aircraft.length`): the API's own
  // UNAVAILABLE envelope already carries `total: 0, aircraft: []` when
  // `connected` is false, so this is the one honest count either way.
  const total = data?.total ?? 0;
  const drawnCount = aircraftDrawCountForTier(tier, total);

  return (
    <>
      <ul className="sr-only" aria-label="Aircraft near the Sangam" data-reality-aircraft={total} data-reality-aircraft-drawn={drawnCount}>
        {aircraft.map((a) => (
          <li key={a.cs}>{aircraftLine(a)}</li>
        ))}
      </ul>
      <span className="sr-only" data-survey-lens={lensOpen ? "open" : "closed"} />
      {lensOpen && <SatellitesLedgerRow />}
    </>
  );
}

/** A separate child (not just an inline expression), so `useSatellites()`
 *  and the `satellite.js` chunk its own effect lazy-`import()`s is only
 *  ever mounted while `AircraftList`'s own parent has already decided the
 *  lens is open; conditionally CALLING a hook inline would break the rules
 *  of hooks, conditionally MOUNTING the component that calls it doesn't. */
function SatellitesLedgerRow() {
  const state = useSatellites();
  const visibleCount = state.ready ? state.visible.length : 0;
  return <span className="sr-only" data-reality-satellites={visibleCount} />;
}
