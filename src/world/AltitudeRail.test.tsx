import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

let pathname = "/map";
let search: Record<string, unknown> = {};
const navigateCalls: Array<{ to: string }> = [];

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ pathname, search }),
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


describe("AltitudeRail focus handoff", () => {
  it("passes map focus into the STREET URL and returns it through at", () => {
    pathname = "/map";
    search = { focus: "doori" };
    expect(renderToString(createElement(AltitudeRail))).toContain('href="/playground?at=doori"');
    pathname = "/playground";
    search = { at: "doori" };
    expect(renderToString(createElement(AltitudeRail))).toContain('href="/map?focus=doori"');
    search = {};
  });

  it("ignores non-string focus without changing the plain destination", () => {
    pathname = "/map";
    search = { focus: ["doori"] };
    expect(renderToString(createElement(AltitudeRail))).toContain('href="/playground"');
    search = {};
  });
});
