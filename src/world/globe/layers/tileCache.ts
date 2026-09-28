// WAVE 2 LANE W1 (deep zoom): a tiny generic LRU, so a texture (or an
// AbortController, or anything else keyed by tile id) can be capped and
// evicted with a caller-supplied dispose — no dependency on three here, so
// this is unit-testable with plain values and a spy, and TileLayer.tsx is
// free to reuse it for more than one cap (T1 base 128 tiles, T2 overlay 48).
//
// Map's own iteration order is insertion order, and re-inserting a key (via
// delete-then-set) moves it to the end — that single property is the whole
// mechanism: the front of the map is always the least-recently-used entry.
export class TileLRU<T> {
  private readonly map = new Map<string, T>();

  constructor(
    private readonly maxSize: number,
    private readonly dispose: (value: T) => void,
  ) {}

  get size(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Reads a value and marks it most-recently-used. */
  get(key: string): T | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** Inserts (or replaces) a value as most-recently-used, evicting the
   *  oldest entries over `maxSize`. Replacing a key disposes the value it
   *  displaced (a caller re-fetching the same tile at a new texture object
   *  must not leak the old one). */
  set(key: string, value: T): void {
    const existing = this.map.get(key);
    if (existing !== undefined && existing !== value) this.dispose(existing);
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as string;
      const oldest = this.map.get(oldestKey)!;
      this.map.delete(oldestKey);
      this.dispose(oldest);
    }
  }

  delete(key: string): void {
    const value = this.map.get(key);
    if (value === undefined) return;
    this.map.delete(key);
    this.dispose(value);
  }

  clear(): void {
    for (const value of this.map.values()) this.dispose(value);
    this.map.clear();
  }
}
