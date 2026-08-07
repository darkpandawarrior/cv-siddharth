import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/**
 * resolve.ts holds module-level mutable state (the 147-cell ratchet), same
 * as telemetry.ts and input.ts elsewhere in this world — so every describe
 * block below re-imports it fresh via `vi.resetModules()` rather than
 * sharing one instance across tests. Without that, "returns ≤ 11 cells for
 * any single call" and "monotone non-decreasing" would be testing whatever
 * state a PREVIOUS test left behind, not the behaviour in isolation.
 */
async function freshResolve() {
  vi.resetModules();
  return import("./resolve.ts");
}

/** A minimal in-memory localStorage — vitest's `environment: "node"` (see
 *  vitest.config.ts) has no real one, and `resolve.ts` follows explored.ts's
 *  established try/catch-around-localStorage pattern rather than assuming
 *  one exists. */
function stubLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe("the resolve grid", () => {
  it("covers the slab in exactly 147 cells (7 columns x 21 rows)", async () => {
    const { cellKey } = await freshResolve();
    // Every corner of the 56m x 168m slab (CITY.halfWidth=28, z0=-80, z1=88)
    // must resolve to a cell, and the far corners must differ from the near
    // ones — the grid actually spans the space rather than collapsing to a
    // single bucket.
    const nw = cellKey(-28, -80);
    const se = cellKey(28, 88);
    const mid = cellKey(0, 0);
    expect(new Set([nw, se, mid]).size).toBe(3);
    expect(nw).toBeGreaterThanOrEqual(0);
    expect(se).toBeLessThan(7 * 21);
  });

  it("clamps rather than throwing for a point past the kerb", async () => {
    const { cellKey } = await freshResolve();
    expect(() => cellKey(999, 999)).not.toThrow();
    expect(cellKey(999, 999)).toBe(cellKey(28, 88));
  });
});

describe("stamp() — the per-frame heartbeat", () => {
  it("returns at most 11 newly-resolved cells for any single call", async () => {
    const { stamp } = await freshResolve();
    for (const heading of [0, Math.PI / 4, Math.PI, -Math.PI / 2]) {
      const got = stamp(0, 0, heading, 1);
      expect(got.length).toBeLessThanOrEqual(11);
    }
  });

  it("is a ratchet: the same spot stamped twice resolves nothing new the second time", async () => {
    const { stamp } = await freshResolve();
    const first = stamp(0, 0, 0, 1);
    expect(first.length).toBeGreaterThan(0);
    const second = stamp(0, 0, 0, 2);
    expect(second).toEqual([]);
  });

  it("never un-resolves: 200 synthetic fixes produce a monotone non-decreasing resolved fraction", async () => {
    const { stamp, resolvedFraction } = await freshResolve();
    let previous = resolvedFraction();
    expect(previous).toBe(0);
    // A wandering synthetic drive: not a straight line, so the ratchet is
    // actually exercised against re-visited and skipped cells alike.
    let x = -20;
    let z = -75;
    for (let i = 0; i < 200; i++) {
      const heading = Math.sin(i * 0.3) * 1.2;
      x += Math.sin(heading) * 3 + (Math.random() - 0.5) * 2;
      z += Math.cos(heading) * 3;
      stamp(x, z, heading, i * 0.1);
      const now = resolvedFraction();
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBeGreaterThan(0);
  });

  it("stamps forward along heading, not just the 3x3 block underfoot", async () => {
    const { stamp, cellKey } = await freshResolve();
    // Facing due +Z (heading 0): two cells ahead is 16m further south.
    const got = stamp(0, -80, 0, 1);
    const ahead = cellKey(0, -80 + 16);
    expect(got).toContain(ahead);
  });
});

describe("localStorage persistence", () => {
  beforeEach(stubLocalStorage);

  it("round-trips the resolved set bit-exact", async () => {
    const { stamp, saveResolved, triggerTimeOf, cellKey } = await freshResolve();
    stamp(-10, -60, 0, 1);
    stamp(12, 40, Math.PI, 1);
    const resolvedBefore = new Set<number>();
    for (let x = -28; x <= 28; x += 4) {
      for (let z = -80; z <= 88; z += 4) {
        const c = cellKey(x, z);
        if (triggerTimeOf(c) >= 0) resolvedBefore.add(c);
      }
    }
    expect(resolvedBefore.size).toBeGreaterThan(0);
    saveResolved();

    // Fresh module instance, as if the page had just reloaded — the whole
    // point of persistence is surviving exactly this.
    vi.resetModules();
    const fresh = await import("./resolve.ts");
    fresh.loadResolved();
    const resolvedAfter = new Set<number>();
    for (const c of resolvedBefore) if (fresh.triggerTimeOf(c) >= 0) resolvedAfter.add(c);
    expect(resolvedAfter).toEqual(resolvedBefore);
  });

  it("degrades to an empty grid rather than throwing when storage is unavailable", async () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    const { loadResolved, saveResolved, resolvedFraction } = await freshResolve();
    expect(() => loadResolved()).not.toThrow();
    expect(() => saveResolved()).not.toThrow();
    expect(resolvedFraction()).toBe(0);
  });
});

describe("resolveAttributes", () => {
  it("builds one instance per xyz triple, seeded unresolved by default", async () => {
    const { resolveAttributes } = await freshResolve();
    const targets = new Float32Array([0, 1, 0, 5, 1, 5, -5, 1, -5]);
    const attrs = resolveAttributes(targets);
    expect(attrs.aTarget.count).toBe(3);
    expect(attrs.aScatter.count).toBe(3);
    expect(attrs.aTriggerTime.count).toBe(3);
    expect(attrs.cells.length).toBe(3);
    for (let i = 0; i < 3; i++) expect(attrs.aTriggerTime.getX(i)).toBe(-1);
  });

  it("seeds already-resolved cells at construction time, not -1", async () => {
    const { stamp, resolveAttributes } = await freshResolve();
    stamp(0, 0, 0, 5); // resolves the cell at the origin
    const targets = new Float32Array([0, 1, 0]);
    const attrs = resolveAttributes(targets);
    expect(attrs.aTriggerTime.getX(0)).toBe(5);
  });

  it("generates a scatter position distinct from the target when none is supplied", async () => {
    const { resolveAttributes } = await freshResolve();
    const targets = new Float32Array([10, 2, 10]);
    const { aScatter, aTarget } = resolveAttributes(targets);
    const dist = Math.hypot(
      aScatter.getX(0) - aTarget.getX(0),
      aScatter.getY(0) - aTarget.getY(0),
      aScatter.getZ(0) - aTarget.getZ(0),
    );
    expect(dist).toBeGreaterThan(1);
  });

  it("honours an explicit scatter array instead of generating one", async () => {
    const { resolveAttributes } = await freshResolve();
    const targets = new Float32Array([10, 2, 10]);
    const scatter = new Float32Array([-40, 0, -40]);
    const { aScatter } = resolveAttributes(targets, scatter);
    expect(aScatter.getX(0)).toBe(-40);
  });
});

describe("updateTriggers", () => {
  it("only writes instances whose cell is in the newly-resolved list", async () => {
    const { resolveAttributes, updateTriggers, cellKey } = await freshResolve();
    const targets = new Float32Array([0, 1, 0, 20, 1, 80]); // two far-apart cells
    const attrs = resolveAttributes(targets);
    const cellA = cellKey(0, 0);
    updateTriggers(attrs.aTriggerTime, attrs.cells, [cellA], 7);
    expect(attrs.aTriggerTime.getX(0)).toBe(7);
    // The second instance's cell was never in newCells — untouched.
    expect(attrs.aTriggerTime.getX(1)).toBe(-1);
  });

  it("is a no-op for an empty newCells list", async () => {
    const { resolveAttributes, updateTriggers } = await freshResolve();
    const targets = new Float32Array([0, 1, 0]);
    const attrs = resolveAttributes(targets);
    const versionBefore = attrs.aTriggerTime.version;
    updateTriggers(attrs.aTriggerTime, attrs.cells, [], 9);
    // needsUpdate is a write-only setter (bumps `.version`) — asserting the
    // version never moved is the observable proxy for "nothing was written".
    expect(attrs.aTriggerTime.version).toBe(versionBefore);
  });
});

describe("applyResolveShader", () => {
  it("wires distinct injected code for dust vs rise, at #include <begin_vertex>", async () => {
    const { applyResolveShader } = await freshResolve();
    const dustMat = new THREE.MeshBasicMaterial();
    const riseMat = new THREE.MeshBasicMaterial();
    applyResolveShader(dustMat, "dust");
    applyResolveShader(riseMat, "rise");
    expect(dustMat.customProgramCacheKey?.()).not.toBe(riseMat.customProgramCacheKey?.());

    // onBeforeCompile mutates the `shader` object it's given — capture that.
    const dustShaderObj = { vertexShader: "#include <begin_vertex>", uniforms: {} };
    dustMat.onBeforeCompile!(dustShaderObj as never, null as never);
    const dustShader = dustShaderObj.vertexShader;

    const riseShaderObj = { vertexShader: "#include <begin_vertex>", uniforms: {} };
    riseMat.onBeforeCompile!(riseShaderObj as never, null as never);
    const riseShader = riseShaderObj.vertexShader;

    expect(dustShader).toContain("mix(aScatter, aTarget, resolveProg)");
    expect(riseShader).toContain("transformed *= resolveProg");
    expect(dustShader).not.toBe(riseShader);
  });
});
