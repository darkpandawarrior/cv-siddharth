// LANE U1 (composition): split out of Markers.tsx so that file can go back
// to exporting only the `Markers` component (react-refresh/only-export-
// components warns otherwise - fast refresh needs a component-only module).
// Pure logic, no three/R3F/React import, so it is unit-testable without a
// WebGL context (puneSelection.test.ts).
import { readColor } from "../../themeColorThree.ts";
import { employerMarkers, employersUnresolved } from "../../data/globeGeo.ts";
import { globeFacts } from "./globeRows.ts";
import type { Selection } from "./globeStore.ts";

/** The id every Pune selection carries, so the HUD's markers toggle
 *  (Globe.tsx) can tell "the inspector is showing Pune" apart from any
 *  other selection before closing it. */
export const PUNE_SELECTION_ID = "pune-origin";

/** Builds the Inspector payload the retired floating Pune card used to
 *  carry inline - the three claim sentences from globeRows.ts, each row
 *  keyed by the column/ring colour it describes, "source"/"live" naming
 *  where the numbers come from (G8) rather than inventing a fresh copy.
 *  Shared by a ring click (Markers.tsx) and the desktop first-load
 *  preselect (Globe.tsx) so both use the identical payload - one source of
 *  truth, not two. */
export function buildPuneSelection(): Selection | null {
  if (employerMarkers.length === 0) return null;
  const signal = readColor("--color-signal", "#3ddc84").getStyle();
  const probe = readColor("--color-probe", "#5ee6ff").getStyle();
  const home = employerMarkers[0];
  const names = employerMarkers.map((m) => m.company).join(", ");
  const unresolvedNote = employersUnresolved.length > 0 ? ` - ${employersUnresolved.join(", ")} listed, never geocoded` : "";
  const fact = (id: string) => globeFacts.find((r) => r.id === id)!.label;
  return {
    id: PUNE_SELECTION_ID,
    kind: "origin",
    title: `${home.location.split(",")[0].toUpperCase()} · ${home.lat.toFixed(2)}°N ${home.lon.toFixed(2)}°E`,
    rows: [
      { label: "Reach", value: fact("reach-installs"), swatch: signal },
      { label: "Upstream", value: fact("reach-upstream"), swatch: probe },
      { label: "Employers", value: names + unresolvedNote, swatch: probe },
    ],
    source: "store.ts, profile/openSource.ts, profile/experience.ts",
    live: false,
    focus: { kind: "latlon", lat: home.lat, lon: home.lon, distance: 18 },
  };
}
