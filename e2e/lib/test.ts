import { test as base, expect } from "@playwright/test";
import { VISITOR_KEY } from "../../src/play/visitors.ts";

/**
 * The suite's `test`, which differs from Playwright's in exactly one way: a
 * page opened through it is not counted as a visitor.
 *
 * The visitor ledger lives in a remote PartyKit document keyed on hostname, so
 * every local run shares one counter that persists between runs — it was past
 * 1,190 when this was written. Playwright gives each test its own context,
 * which the site correctly reads as a new browser, so EVERY spec that opens
 * /playground silently incremented that counter. visitors.spec.ts meanwhile
 * asserts exact deltas against it, and spec files run on parallel workers, so
 * its arithmetic was being moved under it by whatever else happened to be
 * loading /playground at that moment. Adding one unrelated spec that visits
 * /playground took it from one failing test to three.
 *
 * Opting out uses the site's own documented behaviour rather than a test-only
 * seam: a browser that cannot persist its visitor record declines to be
 * counted (visitors.spec.ts's last case is the assertion that this is true).
 * Only VISITOR_KEY is refused, so view preferences and the shared layer's own
 * storage keep working — blocking the whole `cv:` prefix would change what the
 * other specs are testing.
 *
 * visitors.spec.ts deliberately imports @playwright/test directly: it is the
 * one spec that must be counted.
 */
export const test = base.extend({
  // Named `run`, not Playwright's usual `use`: the react-hooks lint rule reads
  // a bare use() call as a React hook and fails the build. The name is ours to
  // pick, so pick one that does not collide.
  page: async ({ page }, run) => {
    await page.addInitScript((key: string) => {
      const real = window.localStorage;
      const deny = (k: string) => {
        if (k === key) throw new DOMException("denied", "SecurityError");
      };
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => ({
          getItem: (k: string) => (deny(k), real.getItem(k)),
          setItem: (k: string, v: string) => (deny(k), real.setItem(k, v)),
          removeItem: (k: string) => (deny(k), real.removeItem(k)),
          clear: () => real.clear(),
          key: (i: number) => real.key(i),
          get length() {
            return real.length;
          },
        }),
      });
    }, VISITOR_KEY);
    await run(page);
  },
});

export { expect };

/**
 * Resolves once React has hydrated the page.
 *
 * Playwright will happily click a server-rendered button that has no handler
 * attached yet: the click lands on inert markup and is lost, and the test then
 * waits out its budget for a pane it never actually asked for. The symptom is
 * always a timeout on the thing the click should have produced, which reads as
 * "the app is slow" and is really "the click never happened" — raising the
 * budget does nothing, and it only shows up under a full parallel run, where
 * hydration is late enough for the race to open.
 *
 * Detected by looking for React's fiber keys on a real DOM node, which is the
 * framework's own evidence that it has taken ownership of the markup. Use this
 * before the first click on any route whose controls are server-rendered.
 */
export async function waitForHydration(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => {
    const seen = (el: Element): boolean =>
      Object.keys(el).some((k) => k.startsWith("__react")) || Array.from(el.children).some(seen);
    return seen(document.body);
  }, undefined, { timeout: 30_000 });
}
