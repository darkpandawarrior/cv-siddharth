import { test, expect, type Page } from "./lib/test.ts";
import { surfaces } from "../src/data/surfaces.ts";
import { projects } from "../src/data/profile.ts";
import { SPINE, SPINE_TAIL, TRAILING_MAX, PINNED_AREA_MAX, MIN_BLOCK, present, type Vp } from "../src/spine/registry.ts";

/**
 * THE SPINE GATE. Route x viewport matrix over everything src/spine/registry.ts
 * lists. Routes come from the registries (never a hand list), plus every project,
 * one essay and the 404, because the 404 is a page visitors land on too.
 * The FAQ failed four of these checks at once (height, tail, trailing, and, had
 * it been unregistered, "unnamed block outside <main>") on 24 routes.
 */
test.describe.configure({ mode: "parallel" });

const VIEWPORTS: { vp: Vp; width: number; height: number }[] = [
  { vp: "1440", width: 1440, height: 900 },
  { vp: "390", width: 390, height: 844 },
];
const ROUTES = [...new Set(["/", ...surfaces.map((s) => s.to), ...projects.map((p) => `/project/${p.slug}`), "/read/deadline", "/does-not-exist"])];
const STRICT = process.env.SPINE_STRICT === "1";
const owed = (debt?: string) => !!debt && !STRICT;
const DOM = SPINE.filter((e) => e.selector);

function audit(page: Page, skipTopAnchored: boolean) {
  return page.evaluate(
    ({ entries, MIN_BLOCK, skipTopAnchored }) => {
      const label = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}.${String((el as HTMLElement).className).split(" ").slice(0, 3).join(".")}`;
      // Registered = the element is, sits inside, or wraps a registered spine element.
      const registered = (el: Element) => entries.some((s) => el.closest(s.selector) || el.querySelector(s.selector));
      const main = document.querySelector("main");
      const pageH = document.documentElement.scrollHeight;
      const vis = (el: Element) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
      const boxes: Record<string, { top: number; bottom: number; h: number; pe: string }[]> = {};
      for (const s of entries) boxes[s.id] = [...document.querySelectorAll(s.selector)].filter(vis).map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + scrollY, bottom: r.bottom + scrollY, h: r.height, pe: getComputedStyle(el).pointerEvents };
      });

      // 1. Furniture outside <main> that nobody named.
      const unnamed: string[] = [];
      const visit = (el: Element) => {
        for (const c of el.children) {
          if (c === main || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK)$/.test(c.tagName)) continue;
          if (main && c.contains(main)) { visit(c); continue; }
          if (!vis(c) || c.getBoundingClientRect().height < MIN_BLOCK) continue;
          if (!registered(c)) unnamed.push(`${label(c)} h=${Math.round(c.getBoundingClientRect().height)}`);
        }
      };
      visit(document.body);

      // 2. Fixed/sticky elements: registered, within pinned area, and not sitting on top of unrelated controls.
      const INTERACTIVE = "a[href],button,input,select,textarea,summary,[role=button],[tabindex]:not([tabindex='-1'])";
      const unnamedFixed: string[] = [], pinned: { el: string; share: number }[] = [], covered = new Set<string>();
      for (const f of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(f);
        if ((cs.position !== "fixed" && cs.position !== "sticky") || !vis(f)) continue;
        if (cs.pointerEvents === "none") continue;
        const r = f.getBoundingClientRect();
        if (!registered(f)) unnamedFixed.push(label(f));
        const vw = innerWidth, vh = innerHeight;
        const visibleArea = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (!f.closest('[role="dialog"]')) pinned.push({ el: label(f), share: visibleArea / (vw * vh) });
        if (skipTopAnchored && r.top <= 0) continue;
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) {
          const x = Math.min(Math.max(r.left + (r.width * i) / 4, 0), vw - 1), y = Math.min(Math.max(r.top + (r.height * j) / 3, 0), vh - 1);
          const stack = document.elementsFromPoint(x, y);
          if (!stack[0] || !f.contains(stack[0])) continue;
          const under = stack.map((e) => e.closest(INTERACTIVE)).find((t) => t && !f.contains(t) && !t.contains(f));
          if (under) covered.add(`${label(f)} covers ${label(under)} "${(under.textContent ?? "").trim().slice(0, 40)}"`);
        }
      }
      const tail = main ? pageH - (main.getBoundingClientRect().bottom + scrollY) : pageH;
      return { pageH, tail, boxes, unnamed, unnamedFixed, pinned, covered: [...covered] };
    },
    { entries: DOM.map((e) => ({ id: e.id, selector: e.selector! })), MIN_BLOCK, skipTopAnchored },
  );
}

for (const { vp, width, height } of VIEWPORTS) {
  for (const path of ROUTES) {
    test(`spine ${path} @${vp}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const t = m.text();
        // URL-less resource 404s are smoke.spec.ts's job (it sees the URL); the PartyKit reconnect is a dependency we do not host.
        if (t.includes("Failed to load resource:") || t.includes("Failed to reconnect after room-reset")) return;
        errors.push(t);
      });
      await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
      await page.setViewportSize({ width, height });
      await page.goto(path, { waitUntil: "networkidle" });
      await page.locator("main").first().waitFor({ timeout: 20_000 }); // ssr:false rooms (/ops, /pulse) mount <main> after hydration
      await page.evaluate(() => document.fonts.ready);

      const a = await audit(page, false);
      const problems: string[] = [];
      for (const e of DOM) {
        if (owed(e.debt)) continue;
        const els = a.boxes[e.id];
        const want = present(e, path);
        if (want === true && els.length === 0) problems.push(`${e.id}: missing on ${path}`);
        if (want === false && els.length > 0) problems.push(`${e.id}: must not render on ${path} at load`);
        const max = e.maxHeight?.[vp];
        for (const b of els) if (max != null && b.h > max) problems.push(`${e.id}: ${Math.round(b.h)}px > ${max}px budget`);
        if (e.kind === "decor") for (const b of els) if (b.pe !== "none") problems.push(`${e.id}: decor must be pointer-events:none`);
        if (e.last) for (const b of els) if (a.pageH - b.bottom > TRAILING_MAX[vp]) problems.push(`${e.id}: ${Math.round(a.pageH - b.bottom)}px renders below it (max ${TRAILING_MAX[vp]})`);
      }
      if (!owed(SPINE_TAIL.debt) && a.tail > SPINE_TAIL.maxHeight[vp]) problems.push(`spine tail after </main>: ${Math.round(a.tail)}px > ${SPINE_TAIL.maxHeight[vp]}px`);
      problems.push(...a.unnamed.map((s) => `unregistered block outside <main>: ${s}`));
      problems.push(...a.unnamedFixed.map((s) => `unregistered fixed/sticky element: ${s}`));
      const floatDebt = SPINE.filter((e) => e.kind === "floating" || e.id === "route-header").some((e) => owed(e.debt));
      if (!floatDebt) {
        problems.push(...a.pinned.filter((p) => p.share > PINNED_AREA_MAX[vp]).map((p) => `pinned ${p.el} holds ${(p.share * 100).toFixed(1)}% of the viewport (max ${PINNED_AREA_MAX[vp] * 100}%)`));
        problems.push(...a.covered);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        problems.push(...(await audit(page, true)).covered.map((c) => `at page end: ${c}`));
      }
      expect([...problems, ...errors.map((e) => `console: ${e}`)], `${path} @${vp}`).toEqual([]);
    });
  }
}

// G15 break-it, built in: an unregistered 1,000px block after <main> must be reported.
test("break-it: an injected FAQ-shaped block outside <main> is caught", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const s = document.createElement("section");
    s.setAttribute("aria-label", "Injected");
    s.style.height = "1000px";
    document.querySelector("main")!.after(s);
  });
  const a = await audit(page, false);
  expect(a.unnamed.some((u) => u.includes("Injected"))).toBe(true);
});
