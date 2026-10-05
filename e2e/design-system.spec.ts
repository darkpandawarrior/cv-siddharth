import { writeFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { surfaces } from "../src/data/surfaces.ts";
import { projects } from "../src/data/profile.ts";

// Keep this expression identical to spine.spec.ts without registering its tests twice.
const ROUTES = [...new Set(["/", ...surfaces.map((s) => s.to), ...projects.map((p) => `/project/${p.slug}`), "/read/deadline", "/does-not-exist"])];
const VIEWPORTS = [
  { vp: "1440", width: 1440, height: 900 },
  { vp: "390", width: 390, height: 844 },
];
const STRICT = process.env.DS_STRICT === "1";

// These status animations communicate activity, rather than a UI state change.
// Entries name an animation, its duration and the reason for the exception.
const MOTION_ALLOWLIST = [
  { name: "spin", seconds: 1, reason: "Tailwind loading indicator completes one rotation per second." },
  { name: "pulse", seconds: 2, reason: "Tailwind pending status breathes once every two seconds." },
];

async function prepare(page: Page, path: string) {
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "audit fixture unavailable" }),
  }));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "attached" });
  await waitForHydration(page);
  await page.evaluate(() => document.fonts.ready);
  // Reveal below-fold text without changing its type or motion declarations.
  await page.addStyleTag({ content: "* { content-visibility: visible !important; } .reveal { opacity: 1 !important; transform: none !important; }" });
  // Cadence labels resolve in a mount effect; audit that state, not the SSR placeholder.
  await page.waitForFunction(() => [...document.querySelectorAll("[data-evidence-chip]")]
    .every((chip) => chip.hasAttribute("data-state")), undefined, { polling: 50 });
}

function audit(page: Page) {
  return page.evaluate((allowlist) => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const tokens = Object.fromEntries(Array.from(cs)
      .filter((name) => /^--(?:text|space|dur|ease)-/.test(name))
      .map((name) => [name, cs.getPropertyValue(name).trim()]));
    const violations: { check: "font-size" | "duration" | "chip"; element: string; detail: string }[] = [];
    const label = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${Array.from(el.classList).map((c) => `.${c}`).join("")}`;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const probe = document.createElement("span");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
    root.append(probe);
    const resolveSize = (value: string) => {
      probe.style.fontSize = "";
      probe.style.fontSize = value;
      return probe.style.fontSize ? parseFloat(getComputedStyle(probe).fontSize) : NaN;
    };
    // Tailwind's default rem scale can be pruned from the emitted theme when unused.
    // Resolve it at the page's root size, alongside every emitted --text-* token.
    const rootSize = parseFloat(cs.fontSize);
    const typeScale = [0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.875, 2.25, 3, 3.75, 4.5, 6, 8].map((rem) => rem * rootSize);
    for (const name of Object.keys(tokens).filter((name) => name.startsWith("--text-") && !name.slice(2).includes("--"))) {
      typeScale.push(resolveSize(`var(${name})`));
    }
    probe.remove();
    const seconds = (value: string) => parseFloat(value) / (value.trim().endsWith("ms") ? 1000 : 1);
    const durations = [0, ...["fast", "base", "slow"].map((name) => seconds(tokens[`--dur-${name}`] ?? ""))];
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const fail = (check: "font-size" | "duration" | "chip", el: Element, detail: string) => violations.push({ check, element: label(el), detail });
    for (const name of ["--text-hero", "--space-section-y", "--dur-fast", "--dur-base", "--dur-slow", "--ease-out-quart"]) {
      if (!tokens[name]) fail("duration", root, `missing design token ${name}`);
    }
    let textCount = 0, motionCount = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || !visible(el)) continue;
      const style = getComputedStyle(el);
      const hasText = Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (hasText) {
        textCount++;
        const size = parseFloat(style.fontSize);
        if (!typeScale.some((allowed) => near(size, allowed))) fail("font-size", el, `${style.fontSize}: ${(el.textContent ?? "").trim().slice(0, 100)}`);
      }
      for (const pseudo of [null, "::before", "::after"]) {
        const motion = pseudo ? getComputedStyle(el, pseudo) : style;
        if (pseudo && (motion.content === "none" || motion.content === "normal")) continue;
        if (pseudo && motion.content !== '""' && motion.visibility === "visible" && Number(motion.opacity) > 0) {
          textCount++;
          if (!typeScale.some((allowed) => near(parseFloat(motion.fontSize), allowed))) fail("font-size", el, `${pseudo} ${motion.fontSize}: ${motion.content}`);
        }
        const transitions = motion.transitionProperty.split(",").map((s) => s.trim());
        const animations = motion.animationName.split(",").map((s) => s.trim());
        for (const [kind, values, names] of [
          ["transition", motion.transitionDuration, transitions],
          ["animation", motion.animationDuration, animations],
        ] as const) {
          values.split(",").forEach((value, i) => {
            const name = names[i % names.length];
            if (name === "none") return;
            const duration = seconds(value);
            if (duration > 0) motionCount++;
            if (durations.some((allowed) => near(duration, allowed))) return;
            if (kind === "animation" && allowlist.some((entry) => entry.name === name && near(duration, entry.seconds))) return;
            fail("duration", el, `${pseudo ?? "element"} ${kind} ${name}: ${value.trim()}`);
          });
        }
      }
    }
    const cadences = ["weekly", "manual", "live", "computed", "modelled", "undated"];
    const grammar: Record<string, RegExp> = {
      weekly: /^(?:as of \d{4}-\d{2}-\d{2}(?: · (?:manual refresh|cadence not tracked|\d+\/\d+ d|stale))?|cadence not tracked|manual refresh)$/,
      manual: /^(?:as of \d{4}-\d{2}-\d{2} · )?manual refresh$/,
      live: /^(?:live · \d{2}:\d{2} IST|unavailable right now|unavailable, retrying in \d+ s)$/,
      computed: /^computed · .+$/,
      modelled: /^modelled · .+$/,
      undated: /^undated$/,
    };
    const chips = [...document.querySelectorAll("[data-evidence-chip], .chip-evidence")];
    for (const chip of chips) {
      const cadence = chip.getAttribute("data-cadence") ?? "";
      const text = (chip.textContent ?? "").trim();
      if (!cadences.includes(cadence) || !grammar[cadence]?.test(text)) fail("chip", chip, `cadence ${cadence || "missing"}: ${JSON.stringify(text)}`);
      if (chip.tagName !== "A" || !/^\/ops#[^\s]+$/.test(chip.getAttribute("href") ?? "") || !chip.getAttribute("title")) fail("chip", chip, "expected a source link to /ops#file and a source tooltip");
      if (chip.getAttribute("data-suspect") === "true" && !chip.querySelector(".chip-evidence__ring")) fail("chip", chip, "SUSPECT chip has no hollow ring");
    }
    return { tokens, rootSize, typeScale, durations, allowlist, textCount, motionCount, chipCount: chips.length, violations };
  }, MOTION_ALLOWLIST);
}

for (const { vp, width, height } of VIEWPORTS) {
  for (const path of ROUTES) {
    test(`design system ${path} @${vp}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await prepare(page, path);
      // Audit DOM chrome only, including HUD and panels; never await canvas frames.
      const result = await audit(page);
      const auditPath = testInfo.outputPath("design-system-audit.json");
      writeFileSync(auditPath, JSON.stringify({ route: path, viewport: vp, ...result }));
      await testInfo.attach("design-system-audit", {
        path: auditPath, contentType: "application/json",
      });
      console.log(`DS ${path} @${vp}: ${result.violations.length} violations (${result.textCount} text, ${result.motionCount} motion, ${result.chipCount} chips)`);
      expect(result.textCount, "the audit must inspect rendered text").toBeGreaterThan(0);
      if (STRICT) expect(result.violations, `${path} @${vp}`).toEqual([]);
    });
  }
}

// DS_BREAK_IT=1 exposes the same strict verdict for the broker's negative run.
test("break-it: an injected 13.37px text node fails the design system", async ({ page }) => {
  await prepare(page, "/");
  await page.evaluate(() => {
    const text = document.createElement("span");
    text.id = "ds-break-it";
    text.textContent = "Injected design-system violation";
    text.style.fontSize = "13.37px";
    document.querySelector("main")!.prepend(text);
  });
  const result = await audit(page);
  const injected = result.violations.filter((v) => v.element === "span#ds-break-it" && v.check === "font-size");
  expect(injected).toHaveLength(1);
  expect(injected[0].detail).toContain("13.37px");
  if (STRICT && process.env.DS_BREAK_IT === "1") expect(injected, "injected 13.37px text").toEqual([]);
});
