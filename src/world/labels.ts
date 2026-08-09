/**
 * Every piece of text floating in the world, and the rules that decide which
 * of it you actually see.
 *
 * WHAT THIS REPLACES. The world grew three independent labelling systems, one
 * per module that happened to need a caption: room names (Pavilions.tsx),
 * project towers (Monuments.tsx), year ticks (Terrain.tsx). Each mounted its
 * own drei `<Html>` portal per label, at a fixed screen size, with no maximum
 * distance and no knowledge that the other two existed. On a 168m boulevard
 * that adds up to ~27 pills, and because they never shrink with distance the
 * far ones are the same size as the near ones: everything on the map piles up
 * into one illegible stack around the horizon line. That is the single biggest
 * reason this world reads as noise rather than as a place — you cannot look at
 * anything without reading everything.
 *
 * WHAT REPLACES IT. One layer, one frame loop, three rules:
 *
 *   1. RANGE. Every label has a distance past which it simply isn't drawn, set
 *      per kind. A year tick matters when you are driving through that year,
 *      not from eight years away.
 *   2. FADE. Inside its range it fades and shrinks with distance, so depth is
 *      legible and the far ones stop competing with the near ones.
 *   3. DECLUTTER. Labels are placed nearest-first within a priority order, and
 *      any label whose box would overlap one already placed is dropped for
 *      this frame. Two labels can never sit on top of each other again.
 *
 * This module is the pure half — the label list, the projection, and the
 * declutter pass, none of which touch the DOM or three.js. WorldLabels.tsx is
 * the half that draws.
 */

import { PLACEMENTS } from "./worldData.ts";
import { ROOMS } from "../rooms.tsx";
import { projectTowers } from "./districtWest.ts";
import { YEAR_BANDS } from "./cityData.ts";
import { CITY } from "./city.ts";
import { LABEL_HEIGHT } from "./pavilionGeometry.ts";

export type LabelKind = "room" | "project" | "year";

export type WorldLabel = {
  id: string;
  kind: LabelKind;
  text: string;
  tint: string;
  /** Route, for the room labels only — lets the layer highlight the one the
   *  HUD is currently pointing at. */
  to?: string;
  position: [number, number, number];
};

/**
 * How far each kind of label carries, in metres.
 *
 * Rooms are the navigation layer and have to be visible from most of the
 * boulevard. Projects are a district you drive INTO — read them as you pass.
 * Years are underfoot: a marker for where you are on the timeline, useless
 * from anywhere but the band itself.
 */
export const LABEL_RANGE: Record<LabelKind, number> = { room: 85, project: 40, year: 24 };

/** Distance at which a label starts fading out, as a fraction of its range. */
const FADE_FROM = 0.55;

/** Draw order when two labels want the same pixels. Rooms always win: they are
 *  the one thing on screen a visitor can act on. */
const PRIORITY: Record<LabelKind, number> = { room: 0, project: 1, year: 2 };

/** Pixels of breathing room required between two labels. */
const COLLISION_PADDING = 6;

/** The world's complete label set. Derived from the same registries the
 *  geometry is built from — never a parallel hand-written list, so a room or
 *  project added to profile.ts cannot end up with a building and no name. */
export function worldLabels(): WorldLabel[] {
  const rooms: WorldLabel[] = PLACEMENTS.flatMap((p) => {
    const room = ROOMS.find((r) => r.to === p.to);
    if (!room) return [];
    return [
      {
        id: `room:${p.to}`,
        kind: "room" as const,
        text: room.label,
        tint: room.tint,
        to: p.to,
        position: [p.position[0], p.position[1] + LABEL_HEIGHT[p.shape], p.position[2]] as [number, number, number],
      },
    ];
  });

  const projects: WorldLabel[] = projectTowers().map((t) => ({
    id: `project:${t.slug}`,
    kind: "project",
    text: t.slug,
    tint: t.dated ? "var(--color-signal)" : "var(--color-text-dim)",
    position: [t.x, t.height + 1.1 + CITY.groundY, t.z],
  }));

  const years: WorldLabel[] = YEAR_BANDS.map((band) => ({
    id: `year:${band.year}`,
    kind: "year",
    text: String(band.year),
    tint: "var(--color-accent)",
    position: [CITY.halfWidth - 1.5, CITY.groundY + 1.8, band.z],
  }));

  return [...rooms, ...projects, ...years];
}

export type Placed = {
  /** Screen position of the label's centre, in CSS pixels. */
  x: number;
  y: number;
  /** Distance in front of the camera, metres. */
  depth: number;
  opacity: number;
  scale: number;
};

/**
 * World point → screen point, through a column-major view-projection matrix.
 *
 * Returns null for anything behind the camera (w <= 0, where the perspective
 * divide flips the point to the opposite side of the screen — the classic way
 * a label for something behind you ends up pinned to the far edge) or far
 * enough outside the frame that it can't matter.
 */
export function project(
  m: ArrayLike<number>,
  p: readonly [number, number, number],
  width: number,
  height: number,
): { x: number; y: number; depth: number } | null {
  const [px, py, pz] = p;
  const w = m[3] * px + m[7] * py + m[11] * pz + m[15];
  if (w <= 0.0001) return null;
  const x = (m[0] * px + m[4] * py + m[8] * pz + m[12]) / w;
  const y = (m[1] * px + m[5] * py + m[9] * pz + m[13]) / w;
  // A little slack past the edges so a label doesn't pop as it leaves frame.
  if (x < -1.3 || x > 1.3 || y < -1.3 || y > 1.3) return null;
  return { x: (x * 0.5 + 0.5) * width, y: (1 - (y * 0.5 + 0.5)) * height, depth: w };
}

/** How visible a label of this kind is at this distance. 0 means don't draw. */
export function falloff(kind: LabelKind, depth: number): { opacity: number; scale: number } {
  const range = LABEL_RANGE[kind];
  if (depth >= range) return { opacity: 0, scale: 1 };
  const t = Math.max(0, (depth / range - FADE_FROM) / (1 - FADE_FROM));
  return {
    opacity: 1 - t,
    // Shrinks to 72% at the far edge of its range. Fixed-size labels were the
    // other half of the pile-up: with no size cue, a room 80m away shouted
    // exactly as loudly as the one you were parked outside.
    scale: 1 - 0.28 * Math.min(1, depth / range),
  };
}

export type Candidate = {
  /** Index into the caller's own label array. */
  index: number;
  kind: LabelKind;
  x: number;
  y: number;
  depth: number;
  /** Measured size of the rendered node, CSS pixels. */
  width: number;
  height: number;
};

/**
 * Greedy nearest-first declutter: returns the indices to draw this frame.
 *
 * Priority first (a room outranks a year), then distance, so the label that
 * survives a collision is always the more useful and the nearer of the two.
 * Greedy rather than optimal on purpose — this runs every frame on ~27 boxes,
 * and the difference between a greedy pass and a perfect one is invisible at
 * 60fps while the cost difference is not.
 */
export function declutter(candidates: readonly Candidate[]): number[] {
  const order = [...candidates].sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.depth - b.depth,
  );
  const taken: { left: number; right: number; top: number; bottom: number }[] = [];
  const drawn: number[] = [];
  for (const c of order) {
    const halfW = c.width / 2 + COLLISION_PADDING;
    const halfH = c.height / 2 + COLLISION_PADDING;
    const box = { left: c.x - halfW, right: c.x + halfW, top: c.y - halfH, bottom: c.y + halfH };
    const collides = taken.some(
      (t) => box.left < t.right && box.right > t.left && box.top < t.bottom && box.bottom > t.top,
    );
    if (collides) continue;
    taken.push(box);
    drawn.push(c.index);
  }
  return drawn;
}
