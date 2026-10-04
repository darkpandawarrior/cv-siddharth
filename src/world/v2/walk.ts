import type { HeightAt } from "./terrainHeight.ts";
import type { RecordBindings } from "./recordBindings.ts";
import { GHAT_LANDING_GEOMETRY_ARGS, CHHATRI_DOME_GEOMETRY_ARGS } from "./kits/records.ts";
import { BOUNDS } from "./valley.ts";

export interface WalkPosition { x: number; z: number }
export interface Landing extends WalkPosition { id: string; label: string; halfX: number; halfZ: number }
export const WATER_LEVEL = 0; // Water.tsx keeps its plane at zero.

/** Footprints match the existing kits, at their existing binding positions. */
export function walkLandings(positions: Readonly<Record<string, readonly number[]>>, records: RecordBindings): Landing[] {
  const out: Landing[] = [];
  for (const [id, halfX, halfZ] of [["doori", 4, 3], ["gaddi", 3.5, 2.5], ["portfolio", 2.1, 0.9]] as const) {
    const pos = positions[id];
    if (pos) out.push({ id, label: id, x: pos[0], z: pos[2], halfX, halfZ });
  }
  for (const ghat of records.employerGhats) {
    ghat.flights.forEach((flight, i) => out.push({
      id: `ghat:${ghat.company}:${i}`, label: ghat.company,
      x: ghat.pos[0] + (i - (ghat.flights.length - 1) / 2) * 0.85,
      z: ghat.pos[2] - 1.6 - flight.steps * 0.2 - 0.3,
      halfX: GHAT_LANDING_GEOMETRY_ARGS[0] / 2, halfZ: GHAT_LANDING_GEOMETRY_ARGS[2] / 2,
    }));
  }
  for (const room of records.roomChhatris) out.push({
    id: `chhatri:${room.to}`, label: room.to, x: room.pos[0], z: room.pos[2],
    halfX: CHHATRI_DOME_GEOMETRY_ARGS[0], halfZ: CHHATRI_DOME_GEOMETRY_ARGS[0],
  });
  return out;
}

export function landingAt(position: WalkPosition, landings: readonly Landing[]): Landing | undefined {
  return landings.find((l) => Math.abs(position.x - l.x) <= l.halfX && Math.abs(position.z - l.z) <= l.halfZ);
}

const dry = (p: WalkPosition, heightAt: HeightAt) => Number.isFinite(p.x) && Number.isFinite(p.z)
  && p.x >= BOUNDS.xMin && p.x <= BOUNDS.xMax && p.z >= BOUNDS.zMin && p.z <= BOUNDS.zMax
  && heightAt(p.x, p.z) > WATER_LEVEL;

/** Sample the path too, so a long step cannot jump across open water. */
export function clampWalk(position: WalkPosition, next: WalkPosition, heightAt: HeightAt): WalkPosition {
  if (!dry(position, heightAt) || !Number.isFinite(next.x) || !Number.isFinite(next.z)) return position;
  const target = { x: Math.max(BOUNDS.xMin, Math.min(BOUNDS.xMax, next.x)), z: Math.max(BOUNDS.zMin, Math.min(BOUNDS.zMax, next.z)) };
  const distance = Math.hypot(target.x - position.x, target.z - position.z);
  const steps = Math.ceil(distance / 0.1);
  let last = position;
  for (let i = 1; i <= steps; i++) {
    const p = { x: position.x + (target.x - position.x) * i / steps, z: position.z + (target.z - position.z) * i / steps };
    if (!dry(p, heightAt)) break;
    last = p;
  }
  return last;
}

export interface WalkState { landing: Landing; position: WalkPosition }
export interface WalkControls { landings: readonly Landing[]; start: (id: string) => boolean; back: () => Promise<void> }
let controls: WalkControls | null = null;
export function getWalkControls(): WalkControls | null { return controls; }
export function setWalkControls(next: WalkControls | null): void {
  controls = next;
  for (const listener of listeners) listener();
}
let walking: WalkState | null = null;
const listeners = new Set<() => void>();
export function getWalk(): WalkState | null { return walking; }
export function subscribeWalk(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: WalkState | null): void {
  walking = next;
  for (const listener of listeners) listener();
}
export function startWalk(position: WalkPosition, landings: readonly Landing[], heightAt: HeightAt): boolean {
  const landing = landingAt(position, landings);
  if (!landing || !dry(position, heightAt)) return false;
  publish({ landing, position });
  return true;
}
export function moveWalk(next: WalkPosition, heightAt: HeightAt): void {
  if (!walking) return;
  const position = clampWalk(walking.position, next, heightAt);
  if (position.x !== walking.position.x || position.z !== walking.position.z) publish({ ...walking, position });
}
export function returnToBoat(): void { if (walking) publish(null); }
