import { describe, expect, it } from "vitest";
import { createArrivalStore } from "./arrivalStore.ts";

describe("shared visitor arrival", () => {
  it("counts once and settles both providers that mounted before the ledger synced", () => {
    const store = createArrivalStore<{ n: number }>();
    const first: unknown[] = [], second: unknown[] = [];
    store.subscribe(visit => first.push(visit));
    store.subscribe(visit => second.push(visit));
    expect(store.claim()).toBe(true);
    expect(store.claim()).toBe(false);
    expect(store.snapshot.settled).toBe(false);
    const visit = { n: 42 };
    store.settle(visit);
    expect(first).toEqual([visit]);
    expect(second).toEqual([visit]);
  });

  it("delivers settlement to a late provider and releases an unmounted subscriber", () => {
    const store = createArrivalStore<number>();
    const removed: unknown[] = [], late: unknown[] = [];
    store.subscribe(visit => removed.push(visit))();
    store.claim();
    store.settle(42);
    store.subscribe(visit => late.push(visit));
    expect(removed).toEqual([]);
    expect(late).toEqual([42]);
  });

  it("settles every provider when storage refuses counting without inventing a visit", () => {
    const store = createArrivalStore<number>();
    const values: unknown[] = [];
    store.subscribe(visit => values.push(visit));
    store.claim();
    store.settle(null);
    expect(store.snapshot).toEqual({ visit: null, settled: true });
    expect(values).toEqual([null]);
    expect(store.claim()).toBe(false);
  });
});
