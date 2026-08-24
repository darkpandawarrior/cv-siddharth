import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { telemetry } from "./telemetry.ts";
import { landmarkDestinations, type Destination } from "./destinations.ts";

/**
 * THE PROJECT/CASE-STUDY APPROACH SENSOR — substrate design doc §5, and the
 * owner's original complaint: "whenever we drive over any project we cant
 * even enter it." Monuments.tsx renders project towers and case-study
 * obelisks as solid geometry; this is the missing sensor half, built the
 * same way Pavilions.tsx builds a room's: a plain AABB test against the
 * car's live position, edge-detected so `onPrompt` fires only on enter/exit
 * rather than every frame the car happens to sit inside a box.
 *
 * Deliberately NOT a second copy of Pavilions' own version — same test
 * function, same shape of loop, reused rather than reinvented — but a
 * separate component from Pavilions itself: rooms fire a NAVIGATE on dwell
 * (the scene tears down), landmarks fire an IN-WORLD PANEL (the scene keeps
 * running behind it). World.tsx wires both through the same
 * `useDwellEnter` hook (dwell.ts) — one mechanism, two `onEnter` actions.
 *
 * Renders nothing. Monuments.tsx already draws the solid structure each
 * approach volume surrounds; this is purely the "are we near one" signal.
 */

function insideApproach(pos: { x: number; y: number; z: number }, d: Destination): boolean {
  const [px, py, pz] = d.position;
  const [hx, hy, hz] = d.approachHalf;
  return Math.abs(pos.x - px) <= hx && Math.abs(pos.y - py) <= hy && Math.abs(pos.z - pz) <= hz;
}

// Computed once at module scope, same as Pavilions.tsx's own top-level
// `PLACEMENTS` read — destinations.ts is plain data, so there is nothing to
// recompute per mount.
const LANDMARKS = landmarkDestinations();

export function Landmarks({ onPrompt }: { onPrompt: (d: Destination | null) => void }) {
  const insideRef = useRef<Destination | null>(null);
  useFrame(() => {
    let hit: Destination | null = null;
    // First match wins. Unlike Pavilions' room approach boxes
    // (worldGeometry.test.ts asserts those never overlap), districtWest.ts
    // does not guarantee two towers/obelisks never sit close enough for
    // their generous approach volumes to overlap — several projects share
    // an exact shipping month. A deterministic first-match (list order,
    // never a coordinate comparison) is enough: it can never flicker
    // between two candidates on consecutive frames.
    for (const d of LANDMARKS) {
      if (insideApproach(telemetry, d)) {
        hit = d;
        break;
      }
    }
    if (hit !== insideRef.current) {
      insideRef.current = hit;
      onPrompt(hit);
    }
  });
  return null;
}
