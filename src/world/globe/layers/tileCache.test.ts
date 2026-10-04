import { describe, expect, it, vi } from "vitest";
import { TileLRU } from "./tileCache.ts";

describe("TileLRU", () => {
  it("evicts the least-recently-used entry once over capacity", () => {
    const dispose = vi.fn();
    const cache = new TileLRU<string>(2, dispose);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C"); // over capacity: "a" is oldest, gets evicted
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(dispose).toHaveBeenCalledExactlyOnceWith("A");
    expect(cache.size).toBe(2);
  });

  it("a get() refreshes recency, so a just-read entry survives the next eviction", () => {
    const dispose = vi.fn();
    const cache = new TileLRU<string>(2, dispose);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.get("a"); // "a" is now most-recently-used; "b" is now oldest
    cache.set("c", "C");
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(dispose).toHaveBeenCalledExactlyOnceWith("B");
  });

  it("disposes the displaced value when a key is overwritten with a different value", () => {
    const dispose = vi.fn();
    const cache = new TileLRU<string>(4, dispose);
    cache.set("a", "A1");
    cache.set("a", "A2");
    expect(cache.get("a")).toBe("A2");
    expect(dispose).toHaveBeenCalledExactlyOnceWith("A1");
  });

  it("delete() disposes and removes; a missing key is a no-op", () => {
    const dispose = vi.fn();
    const cache = new TileLRU<string>(4, dispose);
    cache.set("a", "A");
    cache.delete("a");
    expect(cache.has("a")).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
    cache.delete("nope");
    expect(dispose).toHaveBeenCalledTimes(1); // still 1: no dispose for a key that was never there
  });

  it("clear() disposes every remaining entry", () => {
    const dispose = vi.fn();
    const cache = new TileLRU<string>(4, dispose);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  // Break-it: prove the cap is really enforced at exactly maxSize+1, not off
  // by one in either direction.
  it("break-it: never exceeds maxSize even after many inserts", () => {
    const cache = new TileLRU<number>(3, () => {});
    for (let i = 0; i < 50; i++) cache.set(`k${i}`, i);
    expect(cache.size).toBe(3);
    expect(cache.has("k49")).toBe(true);
    expect(cache.has("k47")).toBe(true);
    expect(cache.has("k46")).toBe(false);
  });
});
