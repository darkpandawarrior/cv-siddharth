import { describe, it, expect } from "vitest";
import { projects, siteRooms } from "../data/profile.ts";
import {
  HOME_GREETING,
  JD_PROMPT,
  QUICK_PROMPTS,
  ROUTE_PHRASES,
  canonicalRoute,
  chipsFor,
  greetingFor,
  routeInfo,
} from "./chatContext.ts";

// The chips, the greeting and the server's route allowlist are all one table.
// These pin the pure selection: given a pathname, which chips come back.
describe("chipsFor", () => {
  it("keeps the general set on the home route", () => {
    expect(chipsFor("/")).toEqual(QUICK_PROMPTS);
  });

  it("offers that project's questions on a project page", () => {
    const chips = chipsFor("/project/mileway");
    expect(chips[0]).toBe(JD_PROMPT); // the recruiter chip leads on every route
    expect(chips).toContain("How did you build Mileway?");
    expect(chips.every((c) => c !== "Tell me about the Compose migration")).toBe(true);
  });

  it("offers that room's questions in a room", () => {
    expect(chipsFor("/lab")).toContain("What is The Lab Bench?");
    expect(chipsFor("/compose")).toContain("What is Compose Playground?");
  });

  it("offers experience questions on the résumé", () => {
    expect(chipsFor("/resume")).toContain("Walk me through your experience");
  });

  // Derived from `projects`, so a rename can't leave stale copy behind.
  it("derives project chips from profile.ts rather than per-slug copy", () => {
    for (const p of projects) {
      const label = p.name.split(" + ")[0].trim();
      expect(chipsFor(`/project/${p.slug}`)).toContain(`How did you build ${label}?`);
    }
  });

  it("falls back to the general set for an unknown path", () => {
    expect(chipsFor("/does-not-exist")).toEqual(QUICK_PROMPTS);
    expect(chipsFor("/project/not-a-project")).toEqual(QUICK_PROMPTS);
  });

  it("ignores a trailing slash — the router hands us both shapes", () => {
    expect(chipsFor("/lab/")).toEqual(chipsFor("/lab"));
  });
});

describe("greetingFor", () => {
  it("keeps the original greeting on the home route", () => {
    expect(greetingFor("/")).toBe(HOME_GREETING);
    expect(greetingFor("/unknown")).toBe(HOME_GREETING);
  });

  it("acknowledges where the visitor is anywhere else", () => {
    expect(greetingFor("/project/mileway")).toContain("**Mileway**");
    expect(greetingFor("/lab")).toContain("**The Lab Bench**");
    expect(greetingFor("/resume")).toContain("**my résumé**");
  });
});

describe("canonicalRoute", () => {
  it("returns the canonical pathname for a route the site actually has", () => {
    expect(canonicalRoute("/")).toBe("/");
    expect(canonicalRoute("/project/kursi")).toBe("/project/kursi");
    expect(canonicalRoute("/forge/")).toBe("/forge");
  });

  // Nothing unrecognised leaves the browser — the server validates too, but a
  // 404 path or a hostile string never becomes a request field in the first place.
  it("returns undefined for anything the site doesn't have", () => {
    expect(canonicalRoute("/project/../../etc/passwd")).toBeUndefined();
    expect(canonicalRoute("//evil.example.com")).toBeUndefined();
    expect(canonicalRoute("/lab?x=1")).toBeUndefined();
  });
});

describe("ROUTE_PHRASES (what the server allowlists)", () => {
  it("covers every room and every project page", () => {
    for (const room of siteRooms) expect(ROUTE_PHRASES[room.to]).toBeTruthy();
    for (const p of projects) expect(ROUTE_PHRASES[`/project/${p.slug}`]).toBeTruthy();
    expect(ROUTE_PHRASES["/"]).toBeTruthy();
  });

  it("has a phrase for every route routeInfo knows, and vice versa", () => {
    for (const route of Object.keys(ROUTE_PHRASES)) expect(routeInfo(route)?.route).toBe(route);
  });
});
