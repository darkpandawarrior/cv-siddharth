import { test, expect, type Page } from "@playwright/test";

// The design doc's second constraint is the one this file exists to pin:
// "Navigation must survive without WebGL. A hub whose only affordance is a
// physics simulation is a hub that breaks for a recruiter on a locked-down
// laptop." Three specs, matching the design doc's own testing section:
// the no-WebGL fallback, the always-reachable List toggle (and that the
// choice survives a reload), and the print contract the anomaly rail and
// instrument view already have (394ef78).

// Every ROOMS entry (src/rooms.tsx, sourced from src/data/profile.ts's
// siteRooms) — kept as a literal list rather than imported so this spec
// exercises the same registry-driven fan-out a visitor actually clicks
// through, independent of whatever craftPhysics/worldData claim to cover it.
const ROOMS: { to: string; label: string }[] = [
  { to: "/compose", label: "Compose Playground" },
  { to: "/lab", label: "The Lab Bench" },
  { to: "/blueprint", label: "The Blueprint Room" },
  { to: "/map", label: "The 3D Storyboard" },
  { to: "/forge", label: "The Particle Forge" },
  { to: "/terminal", label: "The Terminal" },
  { to: "/chess", label: "The Board" },
  { to: "/weeb", label: "Weeb Central" },
];

// hasWebGL() (blueprintShared.tsx) probes exactly "webgl2" and "webgl".
// Returning null only for those two context names — and passing every other
// getContext call through to the real implementation — simulates "this
// machine has no WebGL", not "this machine has no canvas at all": the
// anomaly rail's 2D canvas (mounted on every route, including /playground's
// own header) must keep working underneath this stub.
async function stubNoWebGL(page: Page) {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = new Proxy(orig, {
      apply(target, thisArg, args: [string, ...unknown[]]) {
        if (args[0] === "webgl" || args[0] === "webgl2" || args[0] === "experimental-webgl") return null;
        return Reflect.apply(target, thisArg, args);
      },
    });
  });
}

test.describe("playground world — no WebGL", () => {
  test("renders the card grid, not the canvas, and every room link is reachable", async ({ page }) => {
    // 16 navigations across the heaviest routes on the site (blueprint, map and
    // chess each boot their own three.js scene), so this is genuinely a slow
    // test rather than a hanging one: ~12s alone, and it tipped past the 30s
    // default when the full suite was running. Stated rather than left to luck.
    test.setTimeout(90_000);
    await stubNoWebGL(page);
    await page.goto("/playground");

    await expect(page.getByRole("heading", { name: /this site is a live demo/i })).toBeVisible();
    // No R3F canvas anywhere on the page — the world never got far enough to
    // mount one; RoomGrid rendered directly, not as a caught-error fallback.
    await expect(page.locator(".playground-world canvas")).toHaveCount(0);

    const cards = page.locator(".playground-card");
    await expect(cards).toHaveCount(ROOMS.length);

    for (const room of ROOMS) {
      await page.getByRole("link", { name: new RegExp(room.label, "i") }).click();
      await expect(page).toHaveURL(new RegExp(`${room.to}$`));
      // Every room route carries an sr-only <h1> naming it (RoomFrame, or the
      // room's own component for the three that render outside RoomFrame) —
      // a stronger reachability check than the URL alone, since it fails if a
      // route resolves but renders the wrong (or an error) screen.
      await expect(page.locator("h1")).toContainText(new RegExp(room.label, "i"));
      await page.goto("/playground");
    }
  });
});

test.describe("playground world — List view toggle", () => {
  test("HUD List view switches to the grid, and the choice survives a reload", async ({ page }) => {
    await page.goto("/playground");

    // WebGL is available in this test environment (SwiftShader), so the
    // world mounts by default. Confirming that first means the assertions
    // below actually exercise the toggle instead of trivially passing
    // because the grid was already the only thing that ever rendered.
    // 20s, not the 5s default. This is a lazy chunk that pulls Rapier's
    // ~816kB WASM physics engine and then builds the scene; measured cold in
    // preview it reaches first canvas in ~5.2s, which sits right on the
    // default and fails intermittently. The subject of this test is the
    // toggle, not the load time — but the number is pinned here rather than
    // hidden so a real startup regression still shows up as a failure.
    await expect(page.locator(".playground-world canvas")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "List view" }).click();
    await expect(page.getByRole("heading", { name: /this site is a live demo/i })).toBeVisible();
    await expect(page.locator(".playground-world canvas")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: /this site is a live demo/i })).toBeVisible();
    await expect(page.locator(".playground-world canvas")).toHaveCount(0);
  });
});

test.describe("playground world — print", () => {
  test("print media hides the canvas and prints the room grid instead", async ({ page }) => {
    await page.goto("/playground");
    // 20s, not the 5s default. This is a lazy chunk that pulls Rapier's
    // ~816kB WASM physics engine and then builds the scene; measured cold in
    // preview it reaches first canvas in ~5.2s, which sits right on the
    // default and fails intermittently. The subject of this test is the
    // toggle, not the load time — but the number is pinned here rather than
    // hidden so a real startup regression still shows up as a failure.
    await expect(page.locator(".playground-world canvas")).toBeVisible({ timeout: 20_000 });

    await page.emulateMedia({ media: "print" });
    // .playground-canvas (src/index.css's @media print block), NOT
    // .playground-world, is what's hidden — .playground-world is the shared
    // <main> and stays on the page so the sr-only room grid inside it can
    // become the printed content. A first version of this fix hid
    // .playground-world wholesale, with no grid underneath it (the comment
    // claiming one was aspirational, not real) — that shipped a BLANK
    // printed page while still passing a canvas-only assertion here. Pin the
    // actual deliverable — visible, clickable-looking room links — not just
    // the absence of the canvas.
    await expect(page.locator(".playground-canvas")).toBeHidden();
    await expect(page.locator(".playground-world canvas")).not.toBeVisible();
    await expect(page.locator(".playground-world")).toBeVisible();
    await expect(page.locator(".playground-card")).toHaveCount(ROOMS.length);
    for (const room of ROOMS) {
      await expect(page.getByRole("link", { name: new RegExp(room.label, "i") })).toBeVisible();
    }
  });
});
