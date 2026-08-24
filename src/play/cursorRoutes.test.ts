import { describe, expect, it } from "vitest";
import { surfaces } from "../data/surfaces.ts";
import { CURSOR_ROUTES, canShowCursors, isRecruiterRoute } from "./cursorRoutes.ts";

/* The one property that actually matters here: a recruiter surface can never
 * end up in the cursor allowlist, structurally — not because someone
 * remembered to leave it off a hand-kept list. */

describe("isRecruiterRoute", () => {
  it("excludes the named recruiter routes", () => {
    expect(isRecruiterRoute("/resume")).toBe(true);
    expect(isRecruiterRoute("/hire")).toBe(true);
  });

  it("excludes any project route by prefix, including ones that don't exist yet", () => {
    expect(isRecruiterRoute("/project/mileway")).toBe(true);
    expect(isRecruiterRoute("/project/some-brand-new-case-study")).toBe(true);
  });

  it("does not exclude routes that merely contain the word", () => {
    expect(isRecruiterRoute("/hired")).toBe(false);
    expect(isRecruiterRoute("/resumes")).toBe(false);
    expect(isRecruiterRoute("/project")).toBe(false);
  });

  it("leaves ordinary surfaces alone", () => {
    for (const path of ["/", "/chess", "/weeb", "/anthology", "/pulse", "/playground"]) {
      expect(isRecruiterRoute(path), path).toBe(false);
    }
  });
});

describe("CURSOR_ROUTES", () => {
  it("never contains /resume, /hire, or a /project/* route", () => {
    expect(CURSOR_ROUTES).not.toContain("/resume");
    expect(CURSOR_ROUTES).not.toContain("/hire");
    expect(CURSOR_ROUTES.some((to) => to.startsWith("/project/"))).toBe(false);
  });

  it("is derived from the real surfaces registry, not a parallel hand-kept list", () => {
    // /resume and /hire are real, present surfaces — proving they're filtered
    // out, not simply never entered in the first place.
    expect(surfaces.some((s) => s.to === "/resume")).toBe(true);
    expect(surfaces.some((s) => s.to === "/hire")).toBe(true);

    const nonRecruiter = surfaces.map((s) => s.to).filter((to) => !isRecruiterRoute(to));
    expect([...CURSOR_ROUTES].sort()).toEqual([...nonRecruiter].sort());
  });

  it("still includes the ordinary surfaces reactions were wired into", () => {
    for (const to of ["/chess", "/weeb", "/anthology"]) {
      expect(CURSOR_ROUTES, to).toContain(to);
    }
  });
});

describe("canShowCursors", () => {
  it("agrees with CURSOR_ROUTES both ways", () => {
    expect(canShowCursors("/resume")).toBe(false);
    expect(canShowCursors("/hire")).toBe(false);
    expect(canShowCursors("/chess")).toBe(true);
  });

  it("rejects a route that isn't a surface at all", () => {
    expect(canShowCursors("/not-a-real-route")).toBe(false);
  });
});
