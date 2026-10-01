// LANE P1 (wave 7 parked list, "Apple Weather preset chips" — see the
// wave-7 synthesis doc's own "Parked" note: "LayerPanel is mid-edit by X1",
// now unblocked). Pure preset data plus the store-free diff/apply logic
// LayerPanel.tsx renders as a row of chips. Kept here (not inlined in the
// component) so a preset's exact effect is unit-testable without mounting
// React or zustand.
import type { EarthStyle, ImageryStack, LayerHealth, LayerId } from "../globeStore.ts";

export type PresetId = "storms" | "nightLights" | "space" | "myWorld" | "clean";

export interface LayerPreset {
  id: PresetId;
  label: string;
  /** What the chip's own title/status line says it turns on — written by
   *  hand, not derived, so it reads as a sentence rather than a layer-id
   *  dump (G8: never abbreviate a claim). */
  summary: string;
  /** Every layer in this list turns ON; every other LAYER_IDS entry turns
   *  OFF. "storms"/"myWorld" reuse an existing layer for a second visual
   *  meaning (GDACS storms + wind live under `hazards`/`wind`; story arcs
   *  draw under `presence`, same id ArcLayer.tsx already reads — see
   *  GlobeScene.tsx `layers.presence && <ArcLayer .../>`), not a new toggle. */
  layersOn: readonly LayerId[];
  /** The earth style this preset sets, or undefined to leave the visitor's
   *  own choice alone (a preset that doesn't care about dots-vs-imagery
   *  shouldn't silently flip it). */
  style?: EarthStyle;
  cloudsOn?: boolean;
  storyArcsOn?: boolean;
  /** GIBS overlay ids (layers/gibsCatalog.ts) this preset's imagery stack
   *  should show, replacing whatever overlays were on — undefined leaves
   *  `imagery.overlays` untouched entirely (a preset that has no opinion on
   *  imagery, e.g. "Space", never claims one). `[]` means "no overlays",
   *  a real, deliberate choice (Clean). */
  overlayIds?: readonly string[];
}

// LANE V1 (wave 7 step A) added these two GOES clean-infrared overlays to
// layers/gibsCatalog.ts; imported by id only (string), not by importing that
// file, so this module has no ownership dependency on it landing in a
// particular shape — a renamed/removed id just makes the overlay a no-op
// toggle-on-nothing rather than a compile error, and LayerCatalog.tsx (the
// only file that reads `entry.title`/`entry.description` for real) already
// tolerates an id with no matching catalog entry.
const GOES_INFRARED_OVERLAY_IDS = ["GOES-East_ABI_Band13_Clean_Infrared", "GOES-West_ABI_Band13_Clean_Infrared"] as const;

export const LAYER_PRESETS: readonly LayerPreset[] = [
  {
    id: "storms",
    label: "Storms",
    summary: "Turned on: earth events (storms, fires, quakes), wind, clouds, and GOES infrared where covered.",
    layersOn: ["hazards", "wind"],
    cloudsOn: true,
    style: "imagery", // real imagery so CloudShell's own real GIBS-derived clouds render (GlobeScene.tsx: style === "imagery" && tier !== 3)
    overlayIds: GOES_INFRARED_OVERLAY_IDS,
  },
  {
    id: "nightLights",
    label: "Night lights",
    summary: "Turned on: real day/night imagery with Black Marble city lights on the night side. Cleared weather overlays.",
    layersOn: [],
    style: "imagery", // EarthImagery's own shader mixes night-side city lights into the same draw (earthImageryShader.ts) — no separate toggle exists to add on top of it
    overlayIds: [],
    cloudsOn: false,
  },
  {
    id: "space",
    label: "Space",
    summary: "Turned on: stars, Moon, planets and satellites.",
    layersOn: ["stars", "satellites"],
    // No style/overlayIds: a starfield preset has nothing to say about
    // which earth base or overlay is showing underneath it.
  },
  {
    id: "myWorld",
    storyArcsOn: true,
    label: "My world",
    summary: "Turned on: Pune markers, my apps and repos, My Maps places, visitor arcs and film arcs when the life story plays.",
    layersOn: ["markers", "reach", "guide", "presence"],
  },
  {
    id: "clean",
    storyArcsOn: false,
    label: "Clean",
    summary: "Turned off every layer and clouds for a plain earth.",
    cloudsOn: false,
    layersOn: [],
    style: "imagery",
    overlayIds: [],
  },
];

/** The full desired on/off record a preset produces, given every layer id —
 *  every id in `preset.layersOn` true, every other id false. Pure so a test
 *  can assert the exact record without touching the zustand store. */
export function presetLayerRecord(allIds: readonly LayerId[], preset: LayerPreset): Record<LayerId, boolean> {
  const on = new Set<LayerId>(preset.layersOn);
  return Object.fromEntries(allIds.map((id) => [id, on.has(id)])) as Record<LayerId, boolean>;
}

/** Which ids actually need a `toggleLayer(id)` call to go from `current` to
 *  `desired` — the store only exposes a per-id toggle (no bulk setter), so
 *  applying a preset means calling toggleLayer for exactly the ids that
 *  differ, never re-toggling one already at the target state (which would
 *  flip it back off). */
export function layerIdsToToggle(current: Record<LayerId, boolean>, desired: Record<LayerId, boolean>, allIds: readonly LayerId[]): LayerId[] {
  return allIds.filter((id) => current[id] !== desired[id]);
}

/** The imagery stack a preset produces, given the current one. `undefined`
 *  overlayIds leaves `overlays` byte-for-byte unchanged (reference equal),
 *  so a caller can skip a store write entirely when nothing about imagery
 *  actually changed. */
export function presetImagery(current: ImageryStack, preset: LayerPreset, defaultOpacity: number): ImageryStack {
  if (preset.overlayIds === undefined) return current; // no opinion on imagery: leave the base and overlays exactly as they were
  return { base: current.base, overlays: preset.overlayIds.map((id) => ({ id, opacity: defaultOpacity })) };
}

/** One line naming what the preset turned on, with a caveat appended for
 *  any layer/overlay it turns on whose most recently reported status is
 *  already "failed" — the house rule (globe-lanes.md: "report failed and
 *  draw NOTHING") means the toggle itself is honest either way, but a chip
 *  that stays silent about a feed it just flipped on failing would read as
 *  claiming success it doesn't have. */
export function presetCaveat(preset: LayerPreset, status: Partial<Record<string, LayerHealth>>): string | null {
  const failed: string[] = [];
  for (const id of preset.layersOn) if (status[id]?.state === "failed") failed.push(id);
  for (const id of preset.overlayIds ?? []) if (status[id]?.state === "failed") failed.push(id);
  if (failed.length === 0) return null;
  return `${failed.join(", ")} currently unavailable.`;
}
