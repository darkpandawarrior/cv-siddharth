import { describe, it, expect } from "vitest";
import { resolveSectionAction, classifyHash, classifyChatHref } from "./navigation";

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

// The AI assistant is prompted to answer with markdown links ([The Lab
// Bench](/lab)). This classifier decides which of those become router
// navigation vs. a real new-tab anchor — get it wrong and either the SPA
// full-reloads or an external link 404s inside the router.
describe("classifyChatHref", () => {
  it("routes site paths, including per-project case studies", () => {
    expect(classifyChatHref("/lab")).toEqual({ kind: "route", to: "/lab" });
    expect(classifyChatHref("/project/mileway")).toEqual({ kind: "route", to: "/project/mileway" });
  });

  // The prompt explicitly offers /feed.xml. It's a static file in public/, not
  // a router route — feeding it to navigate() hits the catch-all splat and
  // renders the "Signal lost" 404 instead of the feed.
  it("bypasses the router for static assets (file extension), not 404s them", () => {
    expect(classifyChatHref("/feed.xml")).toEqual({ kind: "external", href: "/feed.xml" });
    expect(classifyChatHref("/llms.txt")).toEqual({ kind: "external", href: "/llms.txt" });
    expect(classifyChatHref("/og-image.png")).toEqual({ kind: "external", href: "/og-image.png" });
    // ...but a real route that merely contains a dot-free segment still routes.
    expect(classifyChatHref("/project/paymentslab")).toEqual({ kind: "route", to: "/project/paymentslab" });
  });

  it("scrolls home-page sections written as /#id or #id", () => {
    expect(classifyChatHref("/#projects")).toEqual({ kind: "section", id: "projects" });
    expect(classifyChatHref("#contact")).toEqual({ kind: "section", id: "contact" });
  });

  it("treats an unknown #hash as the route of the same name", () => {
    expect(classifyChatHref("/#resume")).toEqual({ kind: "route", to: "/resume" });
    expect(classifyChatHref("#project/kursi")).toEqual({ kind: "route", to: "/project/kursi" });
  });

  it("leaves anything with a scheme (or protocol-relative) external", () => {
    expect(classifyChatHref("https://github.com/darkpandawarrior")).toEqual({
      kind: "external",
      href: "https://github.com/darkpandawarrior",
    });
    expect(classifyChatHref("mailto:siddharthpandalai990@gmail.com").kind).toBe("external");
    expect(classifyChatHref("//evil.example.com").kind).toBe("external");
  });

  it("normalizes a slashless path so it can't become a relative reload", () => {
    expect(classifyChatHref("playground")).toEqual({ kind: "route", to: "/playground" });
  });
});
