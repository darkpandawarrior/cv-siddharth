import { test, expect } from "./lib/test.ts";

// The Evidence Atlas, home-scenes-and-chrome lane: the homepage used to log
// two React hydration-mismatch console errors on every load (FitCheck's
// #fit-jd textarea, ResourceDirectory's #resource-search input — see
// design-inputs-ux-3d.json's audit). Repro attempts against this lane's HEAD
// (production preview and true dev SSR, at both viewports below, with and
// without a typed-then-reloaded field) found neither error reproducible —
// most likely already fixed by ancestor commits 80cb7be ("replace
// lazy()/useHydrated with Hydrate boundaries") and a15f5fd ("defer
// below-the-fold homepage hydration"). This is the permanent regression
// guard either way: if a future change reopens either mismatch, this fails.
const HYDRATION_PATTERN = /hydrat|did not match/i;

for (const viewport of [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
]) {
  test(`/ produces zero hydration console errors at ${viewport.name}`, async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") messages.push(msg.text());
    });
    page.on("pageerror", (err) => messages.push(String(err)));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "networkidle" });

    // Scroll the full page so every lazily-hydrated boundary (FitCheck,
    // ResourceDirectory, both well below the fold) actually mounts —  a
    // mismatch that only fires on hydration can't be caught before that.
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);

    const hydrationErrors = messages.filter((m) => HYDRATION_PATTERN.test(m));
    expect(hydrationErrors, `console errors: ${JSON.stringify(messages, null, 2)}`).toEqual([]);
  });
}

// FoundationGraphScene's app nodes are now derived from systemGraph.ts's
// includeBuildPairs (registry-spine's measured edges), not hand-placed — this
// pins the set the constellation is supposed to draw. The 3D canvas itself
// isn't readable by Playwright (WebGL pixels, not DOM), so this reads the
// flat twin FoundationGraph.tsx renders alongside it: real, always-present,
// never aria-hidden text naming the same apps.
test("the foundation graph's flat twin lists doori, gaddi, paymentslab-kmp and candidai", async ({ page }) => {
  await page.goto("/#source", { waitUntil: "networkidle" });
  const twin = page.getByRole("list", { name: "Apps built on this foundation" });
  await expect(twin).toBeVisible();
  const text = await twin.innerText();
  for (const label of ["Doori", "Gaddi", "PaymentsLab-KMP", "Candidai"]) {
    expect(text).toContain(label);
  }
});
