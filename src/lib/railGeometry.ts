import type { Facet } from "../data/facets";
import { byChronology } from "./facets";

export interface Deviation {
  id: string;
  y: number;
}

/**
 * Baseline ticks: start at 0, step by spacing while y ≤ height. The final tick is the last exact
 * multiple of spacing that fits — when spacing does not divide height evenly, the rail's bottom
 * edge sits short of the final tick. This is intended for drawing onto canvas without jamming ticks
 * against the exact pixel boundary.
 */
export function baselineTicks(height: number, spacing: number): number[] {
  if (spacing <= 0) throw new Error("baselineTicks: spacing must be > 0");
  const out: number[] = [];
  for (let y = 0; y <= height; y += spacing) out.push(y);
  return out.length ? out : [0];
}

/**
 * Deviations are laid out by CHRONOLOGY, not by nav order — the rail is a
 * trace of when things were made, so the reading order is time.
 */
export function deviationsFor(facets: Facet[], height: number, pad: number): Deviation[] {
  const ordered = byChronology(facets);
  if (ordered.length === 0) return [];
  if (ordered.length === 1) return [{ id: ordered[0].id, y: height / 2 }];
  const span = height - pad * 2;
  return ordered.map((f, i) => ({ id: f.id, y: pad + (span * i) / (ordered.length - 1) }));
}

/**
 * Pointer-to-facet hit detection: returns the facet id within tolerance of pointer y-coordinate,
 * or null if no match. When multiple deviations are equidistant, the earlier array entry wins
 * (strict inequality on distance comparison ensures this).
 */
export function hitTest(deviations: Deviation[], y: number, tolerance: number): string | null {
  let best: Deviation | null = null;
  let bestDist = Infinity;
  for (const d of deviations) {
    const dist = Math.abs(d.y - y);
    if (dist <= tolerance && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best ? best.id : null;
}
