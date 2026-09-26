import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * SYS-7 "AI with receipts" (P2-13a): a provenance chip on every ordinary chat
 * reply naming which provider answered (or that every one failed and the
 * offline layer covered for it), and Stop actually stopping the request on
 * every AI surface — the console's ordinary chat, the console's JD analysis
 * (which runs jd-condense.ts server-side before the model ever sees the
 * text), and the Compose Playground's generator.
 *
 * Every /api/chat call is mocked (page.route) — nothing here hits a live
 * provider, matching the site's own "no test hits a live network" rule.
 */

const NOW = "2026-09-24T12:27:00+05:30"; // spine.spec.ts / faq-dock.spec.ts's shared fixed instant
const CHAT_INPUT_LABEL = "Ask Panda, or type a slash command";
const DIALOG_NAME = "Panda, Siddharth’s AI assistant";

async function openConsole(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Open chat" }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_NAME });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("AI receipts: the provider chip", () => {
  test("shows 'server: <label>' once an ordinary reply streams in", async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "x-chat-provider": "groq" },
        body: 'data: {"text":"Kotlin, Compose, and a lot of coroutines."}\n\ndata: {"tokens":11}\n\ndata: [DONE]\n\n',
      }),
    );

    await page.goto("/", { waitUntil: "networkidle" });
    await waitForHydration(page);
    await openConsole(page);

    const input = page.getByLabel(CHAT_INPUT_LABEL);
    await input.fill("What do you build with?");
    await input.press("Enter");

    await expect(page.getByText(/server: groq/i)).toBeVisible();
  });

  test("shows an offline fallback once every provider is exhausted", async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    await page.route("**/api/chat", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "down" }) }),
    );

    await page.goto("/", { waitUntil: "networkidle" });
    await waitForHydration(page);
    await openConsole(page);

    const input = page.getByLabel(CHAT_INPUT_LABEL);
    await input.fill("qwertyzxcvbn this matches nothing on the site");
    await input.press("Enter");

    await expect(page.getByText(/offline fallback/i)).toBeVisible();
  });
});

test.describe("AI receipts: Stop actually stops the request", () => {
  test("Stop aborts a streaming Compose generation", async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    // Never resolves on its own — the only way this route settles is the
    // browser cancelling the fetch when Stop fires AbortController.abort().
    await page.route("**/api/chat", () => new Promise(() => {}));
    const aborted: string[] = [];
    page.on("requestfailed", (req) => {
      if (req.url().includes("/api/chat")) aborted.push(req.failure()?.errorText ?? "");
    });

    await page.goto("/compose", { waitUntil: "networkidle" });
    await waitForHydration(page);

    await page.getByPlaceholder("describe a screen — e.g. a login form").fill("a login screen");
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();

    await expect.poll(() => aborted).toContain("net::ERR_ABORTED");
  });

  test("Stop aborts a streaming JD fit analysis (jd-condense's request)", async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    await page.route("**/api/chat", () => new Promise(() => {}));
    const aborted: string[] = [];
    page.on("requestfailed", (req) => {
      if (req.url().includes("/api/chat")) aborted.push(req.failure()?.errorText ?? "");
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await waitForHydration(page);
    const dialog = await openConsole(page);

    const input = page.getByLabel(CHAT_INPUT_LABEL);
    await input.fill("/jd");
    await input.press("Enter");

    const jdBox = page.getByLabel("job description → fit analysis");
    await expect(jdBox).toBeVisible();
    await jdBox.fill("Senior Android Engineer. Kotlin, Jetpack Compose, coroutines, Room.");
    await dialog.getByRole("button", { name: "Analyse fit" }).click();

    await expect(dialog.getByRole("button", { name: "Stop generating" })).toBeVisible();
    await dialog.getByRole("button", { name: "Stop generating" }).click();

    await expect.poll(() => aborted).toContain("net::ERR_ABORTED");
  });
});

test.describe("AI receipts: the JD Fit dossier chit", () => {
  test("the offline card's dossier names a matched skill", async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    // Never resolves — this test only cares about the OFFLINE card the
    // instant match renders before any network reply supersedes it.
    await page.route("**/api/chat", () => new Promise(() => {}));

    await page.goto("/", { waitUntil: "networkidle" });
    await waitForHydration(page);
    const dialog = await openConsole(page);

    const input = page.getByLabel(CHAT_INPUT_LABEL);
    await input.fill("/jd");
    await input.press("Enter");
    const jdBox = page.getByLabel("job description → fit analysis");
    await jdBox.fill("Senior Android Engineer. Kotlin, Jetpack Compose, coroutines, Room.");
    await dialog.getByRole("button", { name: "Analyse fit" }).click();

    const dossier = dialog.getByText("how this was scored");
    await expect(dossier).toBeVisible();
    await dossier.click();
    await expect(dialog.getByText(/Matched on:.*Jetpack Compose/)).toBeVisible();
  });
});
