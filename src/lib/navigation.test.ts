import { describe, it, expect } from "vitest";
import { resolveSectionAction, classifyHash } from "./navigation";

describe("resolveSectionAction", () => {
  it("scrolls in place when already on the home route", () => {
    expect(resolveSectionAction("/")).toBe("scroll");
  });

  it("navigates home first from any other route", () => {
    expect(resolveSectionAction("/resume")).toBe("navigate");
    expect(resolveSectionAction("/project/mileway")).toBe("navigate");
    expect(resolveSectionAction("/lab")).toBe("navigate");
  });
});

// Phase A-part-2: every internal `#hash` conversion (App.tsx, Terminal.tsx,
// StoryMap.tsx, ProjectDetail.tsx, ...) routes through this one classifier —
// pinning its three branches here catches drift in one place instead of N.
describe("classifyHash", () => {
  it("classifies home-page section ids", () => {
    expect(classifyHash("#work")).toEqual({ kind: "section", id: "work" });
    expect(classifyHash("#top")).toEqual({ kind: "section", id: "top" });
    expect(classifyHash("#source")).toEqual({ kind: "section", id: "source" });
  });

  it("classifies project slugs", () => {
    expect(classifyHash("#project/mileway")).toEqual({ kind: "project", slug: "mileway" });
  });

  it("falls back to a route for anything else", () => {
    expect(classifyHash("#resume")).toEqual({ kind: "route", to: "/resume" });
    expect(classifyHash("#loopdown")).toEqual({ kind: "route", to: "/loopdown" });
  });
});
