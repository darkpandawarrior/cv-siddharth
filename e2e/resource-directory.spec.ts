import { test, expect } from "./lib/test.ts";

test("project directory filters real public resources", async ({ page }) => {
  await page.goto("/#source");
  const directory = page.locator("#resources");
  await directory.scrollIntoViewIfNeeded();
  const search = directory.getByRole("searchbox", { name: "Search projects and resources" });
  await expect(search).toBeVisible();
  await page.waitForFunction(() => {
    const input = document.querySelector("#resource-search");
    return input && Object.keys(input).some((key) => key.startsWith("__react"));
  });

  await directory.getByLabel("Filter resource type").selectOption("API docs");
  await expect(directory.getByRole("link", { name: "kmp-toolkit KDocs" })).toHaveAttribute("href", "https://darkpandawarrior.github.io/kmp-toolkit/");
  await expect(directory.getByRole("link", { name: "kmp-build-logic KDocs" })).toHaveAttribute("href", "https://darkpandawarrior.github.io/kmp-build-logic/");

  await search.fill("PaymentsLab");
  await expect(directory).toContainText("No resources match that search");
  await directory.getByLabel("Filter resource type").selectOption("all");
  await expect(directory.getByRole("link", { name: "Narrated showcase" })).toHaveAttribute("href", "/project/paymentslab-kmp#showcase-paymentslab-kmp");
  await expect(directory.getByRole("link", { name: "F-Droid" })).toHaveAttribute("href", "https://darkpandawarrior.github.io/fdroid/repo");
});
