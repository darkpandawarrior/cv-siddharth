/**
 * Aircraft trail ring buffers (open-data-spec.md §3 A1 "Trail"; the deck.gl
 * TripsLayer technique, master-plan.md#P3-03: "Trails as typed ring buffers
 * with aTime"). One buffer per aircraft, each a fixed-capacity ring of the
 * aircraft's own past shell positions with a per-sample time, so
 * `Aircraft.tsx` can fill ONE merged `LineSegments` for every aircraft and
 * fade each segment in its fragment shader as `alpha = 1 - (uNow - aTime) /
 * uTrailSec`.
 *
 * Pure typed-array bookkeeping only, with no three/R3F import, so this is
 * unit-testable without a WebGL context.
 */

export interface TrailSample {
  x: number;
  y: number;
  z: number;
  t: number;
}

/** Fixed-capacity ring: `push` past capacity overwrites the oldest slot,
 *  which IS "dropping the oldest sample at capacity" (this file's own
 *  test). Capacity 0 (T3: "no trail", open-data-spec.md §3 A1's LOD table)
 *  makes every push a no-op rather than a special case callers need to
 *  check for. */
export class AircraftTrailBuffer {
  readonly capacity: number;
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly zs: Float32Array;
  private readonly ts: Float32Array;
  private start = 0;
  private len = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(0, capacity);
    this.xs = new Float32Array(this.capacity);
    this.ys = new Float32Array(this.capacity);
    this.zs = new Float32Array(this.capacity);
    this.ts = new Float32Array(this.capacity);
  }

  push(x: number, y: number, z: number, t: number): void {
    if (this.capacity === 0) return;
    const writeAt = (this.start + this.len) % this.capacity;
    this.xs[writeAt] = x;
    this.ys[writeAt] = y;
    this.zs[writeAt] = z;
    this.ts[writeAt] = t;
    if (this.len < this.capacity) {
      this.len++;
    } else {
      this.start = (this.start + 1) % this.capacity; // oldest sample dropped
    }
  }

  get count(): number {
    return this.len;
  }

  /** `i` counts forward from the oldest kept sample (0) to the newest
   *  (`count - 1`). */
  sampleAt(i: number): TrailSample {
    if (i < 0 || i >= this.len) throw new RangeError(`aircraftTrail: index ${i} out of range (count ${this.len})`);
    const idx = (this.start + i) % this.capacity;
    return { x: this.xs[idx], y: this.ys[idx], z: this.zs[idx], t: this.ts[idx] };
  }

  oldest(): TrailSample | null {
    return this.len === 0 ? null : this.sampleAt(0);
  }

  newest(): TrailSample | null {
    return this.len === 0 ? null : this.sampleAt(this.len - 1);
  }
}

/** LOD trail capacity by device tier (open-data-spec.md §3 A1's own table:
 *  "96 s (32 samples, 3 s apart)" T1, "30 s" T2 (10 samples at the same 3 s
 *  spacing), "none" T3). */
export function trailCapacityForTier(tier: 1 | 2 | 3): number {
  if (tier === 1) return 32;
  if (tier === 2) return 10;
  return 0;
}

/** How many real seconds apart consecutive trail samples land, on every
 *  tier that draws one at all (open-data-spec.md §3 A1: "3 s apart"). */
export const TRAIL_SAMPLE_INTERVAL_S = 3;

/**
 * One `AircraftTrailBuffer` per aircraft, keyed by callsign; the manager
 * `Aircraft.tsx` actually mounts. `prune` drops the buffer for a callsign no
 * longer in the live response, so an aircraft that leaves and later
 * reappears starts a fresh trail rather than resuming a stale one.
 */
export class AircraftTrails {
  private readonly buffers = new Map<string, AircraftTrailBuffer>();
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(0, capacity);
  }

  /** A tier change resizes every future buffer; existing ones are dropped
   *  rather than resampled into a new size, since a resized-but-half-old
   *  trail would fade against a `uTrailSec` the old samples never earned. */
  setCapacity(capacity: number): void {
    if (capacity === this.capacity) return;
    this.capacity = Math.max(0, capacity);
    this.buffers.clear();
  }

  sample(cs: string, x: number, y: number, z: number, t: number): void {
    if (this.capacity === 0) return;
    let buf = this.buffers.get(cs);
    if (!buf) {
      buf = new AircraftTrailBuffer(this.capacity);
      this.buffers.set(cs, buf);
    }
    buf.push(x, y, z, t);
  }

  get(cs: string): AircraftTrailBuffer | undefined {
    return this.buffers.get(cs);
  }

  prune(liveCallsigns: ReadonlySet<string>): void {
    for (const cs of this.buffers.keys()) {
      if (!liveCallsigns.has(cs)) this.buffers.delete(cs);
    }
  }

  entries(): IterableIterator<[string, AircraftTrailBuffer]> {
    return this.buffers.entries();
  }
}
