import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findMarkers, checkWiring, loadFiles } from "./check-ai-wiring.mjs";

const root = new URL("../", import.meta.url).pathname;

const FULLY_WIRED = [
  { path: "api/_lib/fake-handler.ts", content: "// ai-endpoint: chat\nexport function handleChat() {}\n" },
  { path: "src/lib/fakeClient.ts", content: "// ai-client: chat\nexport function askChat() {}\n" },
  { path: "src/FakeWidget.tsx", content: "// ai-consumer: chat\nexport function FakeWidget() {}\n" },
];

describe("findMarkers", () => {
  it("collects each marker kind, keyed by system id, with the files it appeared in", () => {
    const markers = findMarkers(FULLY_WIRED);
    expect([...markers.endpoint.keys()]).toEqual(["chat"]);
    expect([...markers.client.keys()]).toEqual(["chat"]);
    expect([...markers.consumer.keys()]).toEqual(["chat"]);
    expect(markers.endpoint.get("chat")).toEqual(["api/_lib/fake-handler.ts"]);
  });

  it("keeps two systems separate", () => {
    const markers = findMarkers([
      { path: "a.ts", content: "// ai-endpoint: chat" },
      { path: "b.ts", content: "// ai-endpoint: jdfit" },
    ]);
    expect([...markers.endpoint.keys()].sort()).toEqual(["chat", "jdfit"]);
  });

  it("finds nothing in a file with no markers", () => {
    const markers = findMarkers([{ path: "x.ts", content: "export const x = 1;\n" }]);
    expect(markers.endpoint.size).toBe(0);
    expect(markers.client.size).toBe(0);
    expect(markers.consumer.size).toBe(0);
  });
});

describe("checkWiring", () => {
  it("passes a system with all three marker kinds present", () => {
    expect(checkWiring(FULLY_WIRED)).toEqual([]);
  });

  it("is a no-op when nothing carries any marker: nothing to check is not a violation", () => {
    expect(checkWiring([{ path: "x.ts", content: "export const x = 1;\n" }])).toEqual([]);
  });

  it("break-it: fails when the ai-client marker is removed from a fixture", () => {
    const withoutClient = FULLY_WIRED.filter((f) => f.path !== "src/lib/fakeClient.ts");
    const failures = checkWiring(withoutClient);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('"chat"');
    expect(failures[0]).toContain("ai-client");
  });

  it("break-it: fails when the ai-endpoint marker is removed (a client with no backend)", () => {
    const withoutEndpoint = FULLY_WIRED.filter((f) => f.path !== "api/_lib/fake-handler.ts");
    const failures = checkWiring(withoutEndpoint);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("ai-endpoint");
  });

  it("break-it: fails when the ai-consumer marker is removed (a client nothing renders)", () => {
    const withoutConsumer = FULLY_WIRED.filter((f) => f.path !== "src/FakeWidget.tsx");
    const failures = checkWiring(withoutConsumer);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("ai-consumer");
  });
});

describe("loadFiles", () => {
  it("skips a non-text extension entirely", () => {
    expect(loadFiles(["public/favicon.ico"])).toEqual([]);
  });

  it("skips its own source and test fixtures (self-exempt)", () => {
    expect(loadFiles(["scripts/check-ai-wiring.mjs", "scripts/check-ai-wiring.test.mjs"])).toEqual([]);
  });
});

describe("the real repo, end to end", () => {
  const run = (args = []) => execFileSync("node", ["scripts/check-ai-wiring.mjs", ...args], { cwd: root, encoding: "utf8" });

  it("exits 0 on the merged tree (no markers adopted yet is not a violation)", () => {
    expect(() => run()).not.toThrow();
  });

  it("exits 1 on a fixture whose ai-client marker was removed", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-ai-wiring-"));
    const endpointFixture = join(dir, "handler.ts");
    writeFileSync(endpointFixture, "// ai-endpoint: fixturesys\n");
    try {
      expect(() => run([endpointFixture])).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 0 on a fixture carrying all three markers for the same system", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-ai-wiring-"));
    const a = join(dir, "handler.ts");
    const b = join(dir, "client.ts");
    const c = join(dir, "widget.tsx");
    writeFileSync(a, "// ai-endpoint: fixturesys\n");
    writeFileSync(b, "// ai-client: fixturesys\n");
    writeFileSync(c, "// ai-consumer: fixturesys\n");
    try {
      expect(() => run([a, b, c])).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
