import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAgentContext, collectUrls, isAllowedUrl, agentProfile, EXTERNAL_ALLOWLIST } from "./gen-agent-context.mjs";
import { allRoutes } from "../src/data/routes.ts";

const ROOT = new URL("../", import.meta.url).pathname;

describe("collectUrls", () => {
  it("finds absolute and site-relative strings anywhere in a nested value", () => {
    const urls = collectUrls({ a: "/project/doori", b: { c: "https://github.com/x" }, d: ["not-a-url", "/lab"], e: 42 });
    expect(urls).toEqual(["/project/doori", "https://github.com/x", "/lab"]);
  });

  it("ignores plain strings that are neither a path nor a URL", () => {
    expect(collectUrls({ a: "Pune, India", b: "5+ years" })).toEqual([]);
  });
});

describe("isAllowedUrl", () => {
  it("accepts an exact prerendered route", () => {
    expect(isAllowedUrl("/project/doori", ["/project/doori"], [])).toBe(true);
  });

  it("accepts an allowlisted external host, with or without www", () => {
    expect(isAllowedUrl("https://github.com/darkpandawarrior", [], ["github.com"])).toBe(true);
    expect(isAllowedUrl("https://www.github.com/x", [], ["github.com"])).toBe(true);
  });

  it("rejects a route not in allRoutes and a host not on the allowlist", () => {
    expect(isAllowedUrl("/not-a-real-route", ["/"], ["github.com"])).toBe(false);
    expect(isAllowedUrl("https://evil.example.com", ["/"], ["github.com"])).toBe(false);
  });

  it("rejects an unparseable URL rather than throwing", () => {
    expect(isAllowedUrl("https://", [], ["github.com"])).toBe(false);
  });
});

describe("agentProfile", () => {
  it("carries only the identity fields an agent needs, not internal blurb variants", () => {
    const fixture = { name: "A", title: "T", location: "L", email: "e", github: "g", linkedin: "li", portfolio: "p", writing: "w", availability: "av", summary: "s", intro: "leak", phone: "leak" };
    const out = agentProfile(fixture);
    expect(out).toEqual({ name: "A", title: "T", location: "L", email: "e", github: "g", linkedin: "li", portfolio: "p", writing: "w", availability: "av", summary: "s" });
  });
});

describe("buildAgentContext (the acceptance line, in full)", () => {
  const { payload, json } = buildAgentContext();

  it("every URL in the payload is a prerendered route or an allowlisted external host", () => {
    const urls = collectUrls(payload);
    expect(urls.length).toBeGreaterThan(0);
    const bad = urls.filter((u) => !isAllowedUrl(u, allRoutes, EXTERNAL_ALLOWLIST));
    expect(bad, `unresolvable URLs: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it("no value contains 'AgentHarness' or a '~/' path", () => {
    expect(json).not.toMatch(/AgentHarness/);
    expect(json).not.toMatch(/~\//);
  });

  it("two runs are byte-identical (no wall-clock stamp)", () => {
    expect(buildAgentContext().json).toBe(json);
  });

  it("stamps generatedAt as a hash of the payload, not a live date", () => {
    expect(payload.generatedAt).toMatch(/^[0-9a-f]{12}$/);
  });

  it("routes carries the full prerendered set, unmodified", () => {
    expect(payload.routes).toEqual(allRoutes);
  });

  it("matches the committed public/agent-context.json exactly", () => {
    const committed = readFileSync(join(ROOT, "public", "agent-context.json"), "utf8");
    expect(committed, "run `node scripts/gen-agent-context.mjs` — this file is generated").toBe(json);
  });
});
