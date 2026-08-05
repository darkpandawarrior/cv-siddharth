import type { Facet } from "../data/facets";
import { byChronology } from "./facets";

export interface Deviation {
  id: string;
  y: number;
}

/** Evenly spaced baseline ticks, inclusive of both ends. */
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
