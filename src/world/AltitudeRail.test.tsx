// ponytail: `.tsx`, not `.ts` (the lane's own owns list names it that way),
// same trap FaqDock.test.tsx already flagged: vitest.config.ts's `include`
// is `src/**/*.test.ts` only, so `npx vitest run` collects zero tests from
// this file today. That glob belongs to a wire lane, not this one (G2), so
// it can't be widened here. The tests below are real and pass (verified
// with `npx vitest run --config <(node -e '...') src/world/AltitudeRail.test.tsx`
// forcing an include override), but stay dead to the normal run until a
// wire lane adds `*.test.tsx`. Flagged in this lane's final report.
import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

let pathname = "/map";
const navigateCalls: Array<{ to: string }> = [];

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => pathname,
  useNavigate: () => (opts: { to: string }) => navigateCalls.push(opts),
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode; [key: string]: unknown }) =>
    createElement("a", { href: to, ...rest }, children),
}));

const { AltitudeRail } = await import("./AltitudeRail.tsx");

describe("AltitudeRail", () => {
  it("renders three stops", () => {
    const html = renderToString(createElement(AltitudeRail));
    expect(html).toContain("STREET");
    expect(html).toContain("ORBIT");
    expect(html).toContain("GLOBE");
  });

  /** Pulls one <a>'s href out of the SSR string by its data-altitude-stop. */
  function stopHref(html: string, stop: string): string | undefined {
    const tag = [...html.matchAll(/<a\b[^>]*>/g)].find((m) => m[0].includes(`data-altitude-stop="${stop}"`));
    return tag?.[0].match(/href="([^"]*)"/)?.[1];
  }

  it("GLOBE links to /globe?focus=pune from ORBIT (/map)", () => {
    pathname = "/map";
    const html = renderToString(createElement(AltitudeRail));
    expect(stopHref(html, "globe")).toBe("/globe?focus=pune");
  });

  it("STREET links to /playground from GLOBE (/globe)", () => {
    pathname = "/globe";
    const html = renderToString(createElement(AltitudeRail));
    expect(stopHref(html, "street")).toBe("/playground");
  });

  it("marks the current altitude active via data-altitude and aria-current", () => {
    pathname = "/globe";
    const html = renderToString(createElement(AltitudeRail));
    expect(html).toContain('data-altitude="globe"');
    const globeTag = [...html.matchAll(/<a\b[^>]*>/g)].find((m) => m[0].includes('data-altitude-stop="globe"'));
    expect(globeTag?.[0]).toContain('aria-current="true"');
  });

  it("an unknown pathname falls back to STREET as the current altitude, never throws", () => {
    pathname = "/nonexistent-room";
    expect(() => renderToString(createElement(AltitudeRail))).not.toThrow();
    const html = renderToString(createElement(AltitudeRail));
    expect(html).toContain('data-altitude="street"');
  });
});
