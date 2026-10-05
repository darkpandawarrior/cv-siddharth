import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactNode, type ReactElement } from "react";
import { renderToString } from "react-dom/server";

let pathname = "/map";
let search: Record<string, unknown> = {};
let reduced = false;
type Navigation = { to: string; viewTransition: false | { types: string[] } };
const navigateCalls: Navigation[] = [];
vi.mock("../SceneActivity.tsx", () => ({ useReducedMotion: () => reduced }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ pathname, search }),
  useNavigate: () => async (opts: Navigation) => { navigateCalls.push(opts); },
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

describe("AltitudeRail direction and motion", () => {
  beforeEach(() => {
    pathname = "/map"; search = {}; reduced = false; navigateCalls.length = 0;
    vi.stubGlobal("document", { startViewTransition: vi.fn() });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "0.18s" }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  function click(stop: string, modified = false) {
    const root = AltitudeRail();
    const links = root.props.children as ReactElement<{ "data-altitude-stop": string; onClick: (e: unknown) => void }>[];
    const preventDefault = vi.fn();
    links.find((link) => link.props["data-altitude-stop"] === stop)!.props.onClick({
      button: 0, metaKey: modified, preventDefault,
    });
    return preventDefault;
  }
  it("navigates up from ORBIT to GLOBE and down on the reverse", () => {
    click("globe");
    expect(navigateCalls[0]).toEqual({ to: "/globe?focus=pune", viewTransition: { types: ["altitude-up"] } });
    pathname = "/globe"; click("orbit");
    expect(navigateCalls[1]).toEqual({ to: "/map", viewTransition: { types: ["altitude-down"] } });
  });
  it("cuts immediately under reduced motion", () => {
    reduced = true; click("globe");
    expect(navigateCalls[0].viewTransition).toBe(false);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });
  it("leaves modified links and the active stop to their native behavior", () => {
    expect(click("globe", true)).not.toHaveBeenCalled();
    click("orbit");
    expect(navigateCalls).toEqual([]);
  });
  it("awaits the opacity swap when View Transitions are unavailable", async () => {
    let finish!: () => void;
    const fade = { finished: new Promise<void>((resolve) => { finish = resolve; }), cancel: vi.fn() };
    const animate = vi.fn().mockReturnValue(fade);
    vi.stubGlobal("document", { documentElement: { animate } });
    click("globe");
    expect(navigateCalls).toEqual([]);
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
    finish(); await fade.finished; await Promise.resolve();
    expect(navigateCalls[0].viewTransition).toBe(false);
    expect(fade.cancel).toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(2);
  });
});
