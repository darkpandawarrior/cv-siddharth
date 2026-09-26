// ponytail: .test.ts, not .test.tsx — see GatewayCompare.test.ts's own note.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { KmpAdoption } from "./KmpAdoption.tsx";
import { kmpGraph } from "./data/kmpGraph.ts";
import { projectStats } from "./data/projectStats.ts";

describe("KmpAdoption SSR", () => {
  const html = renderToString(createElement(KmpAdoption));

  it("renders one column header per consumer and one row per module", () => {
    for (const consumer of kmpGraph.consumers) {
      expect(html).toContain(`>${consumer.label}<`);
    }
    expect((html.match(/<tr/g) ?? []).length).toBe(kmpGraph.modules.length + 1); // + header row
  });

  it("renders modules x 5 consumer cells", () => {
    // One <td> per (module, consumer) pair — 5 known consumers per idea-atlas.md#I2.
    expect(kmpGraph.consumers.length).toBe(5);
    expect((html.match(/<td/g) ?? []).length).toBe(kmpGraph.modules.length * 5);
  });

  it("marks a module Doori has actually substituted as adopted for doori's column", () => {
    const module = projectStats.doori.substitutedModules[0];
    expect(html).toContain(`substituted in Doori`);
    expect(kmpGraph.modules.some((m) => m.id === module)).toBe(true);
  });

  it("is deterministic: two renders produce identical output", () => {
    expect(renderToString(createElement(KmpAdoption))).toBe(html);
  });
});
