
/**
 * The world's layout — where every room and the slab beneath it sits in
 * three.js space. Every other scene module (Terrain, Pavilions, Craft, Hud)
 * reads these numbers, so the coordinate scheme is fixed here and nowhere
 * else.
 *
 * This file used to hold that scheme itself; it now defers to city.ts, which
 * is the version other district modules (west/east, resolve) also import —
 * one source of truth for the coordinate system rather than two files that
 * could drift. What stays here is the thin translation from city.ts's
 * abstract layout (CITY, ROOM_PLACEMENTS) into the concrete shapes this
 * world's older modules already know how to consume (TERRAIN, PLACEMENTS).
 *
 * COORDINATE SCHEME: +X = east, -X = west · +Y = up, Y = 0 is ground level ·
 * +Z = south, -Z = north. North is 2017, south is now — see city.ts's own
 * comment for why that direction is never flipped.
 *
 * LAYOUT: one 56m-wide, 168m-long slab. Eight rooms sit on it, evenly spaced
 * down its full length rather than dated by any facet — see cityData.ts's
 * ROOM_PLACEMENTS for why. Everything else (the west/east districts, the
 * ground's era colour, the resolving dust) is built against the same CITY
 * constants so nothing here can disagree with them.
 */

import { CITY } from "./city.ts";
import { ROOM_PLACEMENTS } from "./cityData.ts";

/**
 * The slab dimensions, exported so worldGeometry.test.ts can assert the
 * relationships BETWEEN them and craftPhysics.ts's numbers (spawn clearance,
 * world bounds).
 *
 * These lived as bare literals inside JSX once, and that is precisely how
 * this world shipped twice with a trench across its only southbound route
 * and a launch ramp buried in the island it was meant to launch off. Every
 * one of those was a relationship between two numbers in different files —
 * invisible to a typechecker, invisible to a unit test of either file alone.
 * Naming them here makes them assertable.
 */
export const TERRAIN = {
  /** The one slab. 56m wide (CITY.halfWidth*2), 168m long (CITY.z0..z1) —
   *  10 year-bands of 16m plus 8m of honest post-"now" overshoot. */
  mainland: {
    halfWidth: CITY.halfWidth,
    z0: CITY.z0,
    z1: CITY.z1,
    groundY: CITY.groundY,
  },
} as const;

export type Placement = {
  to: string; // MUST match a ROOMS[].to
  position: [number, number, number];
  shape: "slab" | "crt" | "board" | "pcb";
};

/**
 * The eight rooms, translated from cityData.ts's ROOM_PLACEMENTS (which
 * states flank + z) into concrete world positions using CITY.roomOffset for
 * x. Kept as a derivation rather than a second literal table — the design
 * doc's room table is data that belongs in one place, and cityData.ts is it.
 */
export const PLACEMENTS: Placement[] = ROOM_PLACEMENTS.map((r) => ({
  to: r.to,
  position: [r.side === "west" ? -CITY.roomOffset : CITY.roomOffset, CITY.groundY, r.z],
  shape: r.shape,
}));
