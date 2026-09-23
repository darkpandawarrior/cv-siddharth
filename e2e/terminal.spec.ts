import { test, expect } from "./lib/test";

test("terminal keeps its server-rendered banner through hydration", async ({ page }) => {
  await page.addInitScript(() => {
    const missing: number[] = [];
    let seen = false;
    const observer = new MutationObserver(() => {
      const output = document.querySelector('[aria-label="terminal output"]');
      if (!output) return;
      const ready = output.textContent?.includes("ready.") ?? false;
      if (seen && !ready) missing.push(performance.now());
      seen ||= ready;
    });
    observer.observe(document, { childList: true, subtree: true });
    Object.assign(window, { terminalMissingBanner: missing });
  });
  await page.goto("/terminal");
  const output = page.getByRole("main", { name: "terminal output" });
  await expect(output).toContainText("ready.");
  await expect(page.getByRole("textbox")).toBeFocused();
  await page.waitForTimeout(1500); // Covers the former 1.24-second boot replay.
  expect(await page.evaluate(() => Reflect.get(window, "terminalMissingBanner"))).toEqual([]);
});
