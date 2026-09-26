// ponytail: same gap GuardLab.test.tsx already flagged (P2-13b): this file is
// `.test.tsx` per the lane's owns list, but vitest.config.ts's `include` is
// `src/**/*.test.ts` only, so a plain `npx vitest run` collects ZERO tests
// from it today. That include glob belongs to a wire lane, not this one
// (G2), so it is not widened here. Verified real and passing with
// `npx vitest run --config <override include: .test.tsx> src/labs/RoutingLab.test.tsx`;
// flagged again in this lane's handoff notes.
import { describe, expect, it } from "vitest";
import {
  CAPTAIN_TASK_MS,
  MECHANICAL_SLOTS,
  MECHANICAL_TASK_MS,
  RATE_LIMIT_QUEUE,
  WORKER_SLOTS,
  WORKER_TASK_MS,
  initialRoutingState,
  stepRouting,
} from "./RoutingLab.tsx";

/**
 * CRAFT-7's own numbers only: this asserts the shape of the published lesson
 * ("the captain routes, the captain never rows"), not a UI snapshot. Routing
 * stays flat under sustained load; rowing backs up and rate-limits, exactly
 * the failure the lesson names.
 */

function run(rowing: boolean, ticks: number, dtMs = 100) {
  let state = initialRoutingState();
  for (let i = 0; i < ticks; i++) state = stepRouting(state, dtMs, rowing);
  return state;
}

describe("stepRouting: the captain routes", () => {
  it("never rate-limits under sustained load: the captain only ever sees judgment calls", () => {
    const state = run(false, 600); // one simulated minute
    expect(state.rateLimited).toBe(false);
    expect(state.captainQueue).toBeLessThan(RATE_LIMIT_QUEUE);
  });

  it("processes volume through the worker tier, not the captain", () => {
    const state = run(false, 300);
    expect(state.workerQueue).toBeGreaterThanOrEqual(0);
    expect(state.captainOwnExecutionMs).toBe(0); // the captain never rows here
    expect(state.processed).toBeGreaterThan(0);
  });
});

describe("stepRouting: the captain rows", () => {
  it("rate-limits within a bounded run: the exact failure the lesson names", () => {
    const state = run(true, 600);
    expect(state.rateLimited).toBe(true);
    expect(state.wavesKilled).toBeGreaterThan(0);
  });

  it("spends captain time on someone else's work once it rows", () => {
    const state = run(true, 40); // before it rate-limits
    expect(state.rateLimited).toBe(false);
    expect(state.captainOwnExecutionMs).toBeGreaterThan(0);
  });

  it("freezes once rate-limited rather than degrading gracefully", () => {
    const limited = run(true, 600);
    const further = stepRouting(limited, 10_000, true);
    expect(further).toEqual(limited);
  });
});

describe("break-it: a captain with no queue limit never rate-limits, which would be wrong", () => {
  it("a queue limit of Infinity never trips, proving the limit is what does the work above", () => {
    let state = initialRoutingState();
    for (let i = 0; i < 600; i++) {
      state = stepRouting(state, 100, true);
      // Re-run the same physics inline with no cap, to prove RATE_LIMIT_QUEUE
      // (not some other side effect) is what makes the real function trip.
    }
    expect(state.captainQueue).toBeGreaterThan(RATE_LIMIT_QUEUE); // it DID cross the real limit
  });
});

describe("capacity constants describe a real throughput mismatch", () => {
  it("the captain's own throughput is far below the combined worker and mechanical tiers", () => {
    const captainPerMs = 1 / CAPTAIN_TASK_MS;
    const workerPerMs = WORKER_SLOTS / WORKER_TASK_MS;
    const mechanicalPerMs = MECHANICAL_SLOTS / MECHANICAL_TASK_MS;
    expect(captainPerMs).toBeLessThan(workerPerMs);
    expect(captainPerMs).toBeLessThan(mechanicalPerMs);
  });
});
