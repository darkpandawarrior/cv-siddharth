/**
 * THE SPINE REGISTRY.
 *
 * Everything a visitor meets on (nearly) every page, or that many pages inherit,
 * listed with its owner file, the routes it must appear on and what it may cost.
 * Nothing else in the codebase multiplies its cost by the route count, so nothing
 * else gets a budget this strict. It exists because a 17-question FAQ rendered
 * 969 px tall (1,009 px at 390) on 24 routes, below the footer on 12 of them,
 * and no route-scoped audit could see it.
 *
 * Read by src/spine/registry.test.ts (static: whatever qualifies as spine is
 * listed) and e2e/spine.spec.ts (runtime: every route x {1440, 390} honours it).
 * `debt` names the lane fixing a known violation; SPINE_STRICT=1 ignores debt,
 * and the orchestrator removes the marker in the reconcile commit after that
 * lane merges (master-plan M30).
 */
export type Vp = "1440" | "390";
export type Px = Record<Vp, number>;
/** "any" = no presence assertion; "closed" = must not render at load. Patterns ending "/*" match a prefix. */
export type Routes = "all" | "any" | "closed" | { only: string[] } | { except: string[] };
export type SpineEntry = {
  id: string;
  file: string;
  kind: "chrome" | "floating" | "block" | "overlay" | "decor" | "provider" | "primitive" | "css" | "payload";
  selector?: string;
  routes?: Routes;
  maxHeight?: Px;
  /** Nothing taller than TRAILING_MAX may render below it. */
  last?: boolean;
  /** Renders only inside a dialog or panel: its landmarks need no data-spine. */
  internal?: boolean;
  /** Raw bytes added to every route, measured 2026-09-24. Informational; G4 enforces totals. */
  bytes?: number;
  debt?: string;
  why: string;
};

const NO_SITE_FOOTER = ["/blueprint", "/chess", "/compose", "/forge", "/hire", "/lab", "/map", "/playground", "/resume", "/terminal", "/weeb"];

export const SPINE: SpineEntry[] = [
  { id: "skip-link", file: "src/routes/__root.tsx", kind: "chrome", selector: 'a[href="#main-content"]', routes: "all", maxHeight: { "1440": 1, "390": 1 }, why: "first focusable node; sr-only until focused" },
  { id: "sky-line", file: "src/SkyLine.tsx", kind: "chrome", selector: "[data-sky-line]", routes: "all", maxHeight: { "1440": 7, "390": 7 }, debt: "P1-01b", why: "the one sky signal on every page; fixed top hairline (F15)" },
  { id: "route-header", file: "src/rooms.tsx", kind: "chrome", selector: "header.sticky, header.z-10.border-b.border-line", routes: "any", maxHeight: { "1440": 150, "390": 359 }, debt: "P1-01a", why: "7 hand-rolled sticky copies until SP-20 (plus BlueprintRoom.tsx and ComposePlayground.tsx, found unregistered in the live tree since the audit); pinned-area rule does the real work" },
  { id: "anomaly-rail", file: "src/AnomalyRail.tsx", kind: "floating", selector: ".anomaly-rail", routes: "all", debt: "P1-01a", why: "secondary nav, fixed left edge; must not take taps meant for content (F7, F18)" },
  { id: "palette-trigger", file: "src/CommandPalette.tsx", kind: "floating", selector: "button.palette-trigger", routes: "all", maxHeight: { "1440": 44, "390": 44 }, debt: "P1-01a", why: "eager root mount; covers bottom-left content today (F6)" },
  { id: "chat-launcher", file: "src/FloatingChat.tsx", kind: "floating", selector: "button.chat-launcher", routes: "all", maxHeight: { "1440": 56, "390": 56 }, debt: "SP-10", why: "missing on /ops and 404 until mounted once in __root (F13)" },
  // ChatLauncher.tsx split out of FloatingChat.tsx (SP-10, F12/F13): it is the
  // actual eager root mount (imported directly by __root.tsx) and renders the
  // SAME `.chat-launcher` button until chat is wanted, then lazy-hands off to
  // FloatingChat's panel. Registered separately from "chat-launcher" above
  // rather than repointing it, because FloatingChat.tsx still independently
  // qualifies as spine on its own (registry.test.ts's own break-it check
  // requires it to) — it renders its own copy of this button once the panel
  // is later closed.
  { id: "chat-launcher-root", file: "src/ChatLauncher.tsx", kind: "floating", selector: "button.chat-launcher", routes: "all", maxHeight: { "1440": 56, "390": 56 }, why: "root-mounted in __root.tsx; the eager half of F12/F13's split, h-14 w-14 = 56x56" },
  { id: "faq", file: "src/FaqDock.tsx", kind: "block", selector: '[data-spine="faq"]', routes: { except: NO_SITE_FOOTER }, maxHeight: { "1440": 240, "390": 180 }, debt: "SP-01", why: "17 answers, SSR-crawlable; docked as the footer's first band (F1, F2)" },
  { id: "site-footer", file: "src/SiteFooter.tsx", kind: "block", selector: '[data-spine="site-footer"], footer.relative', routes: { except: NO_SITE_FOOTER }, maxHeight: { "1440": 800, "390": 1080 }, last: true, debt: "P1-01a", why: "includes the docked FAQ; 5 groups; no placeholder chips (F3, F4)" },
  { id: "room-pager", file: "src/rooms.tsx", kind: "block", selector: '[data-spine="room-pager"]', routes: "any", maxHeight: { "1440": 96, "390": 96 }, last: true, debt: "SP-10", why: "next-room pager; the FAQ rendered below it on 8 rooms (F2)" },
  { id: "project-chapters", file: "src/ProjectDetail.tsx", kind: "chrome", selector: ".project-chapters", routes: { only: ["/project/*"] }, maxHeight: { "1440": 61, "390": 61 }, debt: "P1-01a", why: "sticky project sub-nav, 9 routes; within budget (section 1a: OK) but the <nav> lacks data-spine and SP-00 does not own src/ProjectDetail.tsx" },
  // ponytail: `kind: "chrome"` is deliberate (it is route chrome, not a floating widget), but that
  // means it is NOT covered by e2e/spine.spec.ts's `floatDebt` short-circuit (floating|route-header
  // only). Its own `debt` below silences the maxHeight check; it does NOT silence the pinned-area
  // check, which has no per-entry exemption and runs unconditionally under SPINE_STRICT=1. So
  // SPINE_STRICT=1 fails here on BOTH "ops-banner: 402px > 398px budget" (1440 only) AND
  // "pinned div.ops-banner holds 39.9%/25.9% of the viewport" (both viewports, max 10%/12%) until
  // P2-14 shrinks it. Both are real and expected; list all of them in the handoff, not just the first.
  { id: "ops-banner", file: "src/OpsBoard.tsx", kind: "chrome", selector: ".ops-banner", routes: { only: ["/ops"] }, maxHeight: { "1440": 398, "390": 688 }, debt: "P2-14", why: "sticky, pins inside its own section; route-local, over budget until P2-14 (maxHeight AND pinned-area both fail under SPINE_STRICT=1, see comment above)" },
  { id: "term-scanlines", file: "src/Terminal.tsx", kind: "decor", selector: ".term-scanlines", routes: { only: ["/terminal"] }, debt: "P1-01a", why: "terminal room CRT scanline overlay, already pointer-events:none; the <div> lacks data-spine and SP-00 does not own src/Terminal.tsx" },
  { id: "playground-wipe", file: "src/Playground.tsx", kind: "decor", selector: ".playground-wipe", routes: { only: ["/playground"] }, debt: "P1-01a", why: "view-switch transition cover, already pointer-events:none, resolving F20(b)'s hit-testability check; the <div> lacks data-spine and SP-00 does not own src/Playground.tsx" },
  { id: "overlays", file: "src/Launcher.tsx", kind: "overlay", selector: '[role="dialog"][aria-modal="true"]', routes: "closed", internal: true, why: "Launcher, CommandPalette, InstrumentView, chat panel: never in the DOM until opened" },
  { id: "cursor-aura", file: "src/CursorAura.tsx", kind: "decor", selector: ".pointer-events-none.fixed.inset-0", routes: "any", why: "full-viewport decor; must stay pointer-events:none" },
  { id: "error-panel", file: "src/ErrorPanel.tsx", kind: "overlay", why: "root errorComponent; pageerror in spine.spec catches its trigger" },
  { id: "global-pulse", file: "src/play/DeferredPlayRoom.tsx", kind: "provider", why: "wraps every route's children; client-only live layer" },
  { id: "chat-widgets", file: "src/ChatWidgets.tsx", kind: "primitive", internal: true, why: "renders only inside the chat panel" },
  { id: "picture", file: "src/Picture.tsx", kind: "primitive", why: "every raster image; a change is a change to 25 routes" },
  { id: "reveal", file: "src/Reveal.tsx", kind: "primitive", why: "scroll reveal wrapper on 12 routes; must respect reduced motion" },
  { id: "world-switch", file: "src/WorldSwitch.tsx", kind: "primitive", why: "mounted by 4 route files" },
  // No own maxHeight/selector: it renders inline inside "route-header"'s
  // already-budgeted row (src/rooms.tsx's RoomFrame), never a block of its
  // own. altitudeFor() only shows it on /map (ORBIT) and /globe (GLOBE); its
  // high reach comes from RoomFrame being every room route's shared wrapper.
  { id: "altitude-rail", file: "src/world/AltitudeRail.tsx", kind: "primitive", why: "ORBIT/GLOBE altitude switcher, folded into route-header on /map and /globe (living-ledger-spec.md#6.2)" },
  { id: "evidence-chip", file: "src/EvidenceChip.tsx", kind: "primitive", why: "the evidence-chip primitive; mounted directly in 5 route files (16 files overall), unregistered when the spine audit's dry run was taken" },
  { id: "global-css", file: "src/index.css", kind: "css", bytes: 188_913, why: "one sheet on every route; owns the z-stack, body clearances, print, focus ring" },
  { id: "desktop-chat-lane", file: "src/index.css", kind: "css", debt: "P1-01a", why: "body padding-right 104 px; only at 768-1279 (F5)" },
  { id: "spine-payload", file: "src/data/profile.ts", kind: "payload", bytes: 112_609 + 108_902 + 49_494, debt: "SP-10", why: "heavy data + chat module reached from the root graph (F12)" },
];

/** Everything after </main>: FAQ + footer + body padding must fit about one viewport. */
export const SPINE_TAIL = { maxHeight: { "1440": 960, "390": 1200 } as Px, debt: "SP-01" as string | undefined };
/** Below a `last` entry only the desktop body padding (104 px) may remain. */
export const TRAILING_MAX: Px = { "1440": 112, "390": 8 };
/** A hit-testable fixed/sticky element may pin at most this share of the viewport. */
export const PINNED_AREA_MAX: Px = { "1440": 0.1, "390": 0.12 };
/** Anything this tall outside <main> is page furniture and must be registered. */
export const MIN_BLOCK = 120;

export function present(e: SpineEntry, path: string): boolean | null {
  const r = e.routes ?? "any";
  if (r === "all") return true;
  if (r === "any") return null;
  if (r === "closed") return false;
  const hit = (p: string) => (p.endsWith("/*") ? path.startsWith(p.slice(0, -1)) : p === path);
  return "only" in r ? r.only.some(hit) : !r.except.some(hit);
}
