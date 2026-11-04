import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const page = (app) => readFileSync(new URL(`../heavy/${app}/index.html`, import.meta.url), "utf8");

describe("app page accessibility", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["stutter-app", "kursi-app", "mileway-app", "deadlock-app"])("%s has a zoomable mobile viewport", (app) => {
    const viewport = page(app).match(/<meta name="viewport" content="([^"]+)">/)?.[1];
    expect(viewport).toMatch(/width=device-width/);
    expect(viewport).toMatch(/initial-scale=1(?:\.0)?(?:,|$)/);
    expect(viewport).not.toMatch(/user-scalable=no|maximum-scale/);
  });

  function startLoader() {
    vi.useFakeTimers();
    const html = page("gaddi-app");
    expect(html).toMatch(/<div id="loader" role="status">/);
    const loader = { textContent: "", classList: { add: vi.fn() } };
    const document = { body: {}, getElementById: () => loader, querySelector: vi.fn() };
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    let notify;
    runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
      document, setTimeout, clearTimeout,
      MutationObserver: class {
        constructor(callback) { notify = callback; return observer; }
      },
    });
    return { loader, document, observer, notify };
  }

  it("keeps the loader visible and reports a slow load after eight seconds", () => {
    const { loader, document, observer, notify } = startLoader();
    vi.advanceTimersByTime(7999);
    expect(loader.textContent).toBe("");
    vi.advanceTimersByTime(1);
    expect(loader.textContent).toContain("Still loading");
    notify();
    expect(loader.classList.add).not.toHaveBeenCalled();
    expect(observer.disconnect).not.toHaveBeenCalled();
    document.querySelector.mockReturnValue({});
    notify();
    expect(loader.classList.add).toHaveBeenCalledWith("hidden");
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("cancels the slow load message when the canvas arrives before the delay", () => {
    const { loader, document, notify } = startLoader();
    document.querySelector.mockReturnValue({});
    notify();
    vi.advanceTimersByTime(8000);
    expect(loader.classList.add).toHaveBeenCalledWith("hidden");
    expect(loader.textContent).toBe("");
  });
});
