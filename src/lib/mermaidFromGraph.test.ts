import { describe, it, expect } from "vitest";
import { mermaidFromGraph } from "./mermaidFromGraph.ts";
import type { KmpGraph } from "../data/kmpGraph.ts";

const fixture: KmpGraph = {
  generatedAt: "2026-09-24",
  modules: [
    { id: "network", usedBy: [{ app: "doori", firstMonth: "2026-01" }, { app: "portfolio", firstMonth: "2026-03" }] },
    { id: "result", usedBy: [{ app: "portfolio", firstMonth: "2026-03" }] },
    { id: "store", usedBy: [] },
  ],
  consumers: [
    { id: "doori", label: "Doori" },
    { id: "portfolio", label: "Portfolio twin" },
  ],
  dependencySpine: [
    { from: "kmp-build-logic", to: "doori" },
    { from: "kmp-toolkit", to: "doori" },
    { from: "kmp-build-logic", to: "portfolio" },
    { from: "kmp-toolkit", to: "portfolio" },
  ],
};

describe("mermaidFromGraph", () => {
  const out = mermaidFromGraph(fixture);

  it("contains every module in kmpGraph.modules", () => {
    for (const mod of fixture.modules) expect(out).toContain(mod.id);
  });

  it("contains the portfolio includeBuild line (idea-atlas.md#REC-1)", () => {
    expect(out).toMatch(/kmp_toolkit -\.->\|"includeBuild"\| portfolio\["Portfolio twin"\]/);
  });

  it("labels a zero-consumer module 'no consumer yet'", () => {
    expect(out).toMatch(/m_store\["store · no consumer yet"\]/);
  });

  // Determinism (I2's own accept line): adding ONE fake module adds exactly
  // ONE node line, nothing else shifts.
  it("adding one fake module to the fixture adds exactly one node line", () => {
    const before = out.split("\n").length;
    const grown: KmpGraph = { ...fixture, modules: [...fixture.modules, { id: "zzz-fake", usedBy: [] }] };
    const after = mermaidFromGraph(grown).split("\n").length;
    expect(after).toBe(before + 1);
  });

  it("is deterministic: same graph in, same output out", () => {
    expect(mermaidFromGraph(fixture)).toBe(mermaidFromGraph(fixture));
  });
});
