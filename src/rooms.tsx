import { SiteHeader } from "./SiteHeader.tsx";
import { useEffect, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Gauge, LayoutGrid, FlaskConical, Smartphone, Compass, Boxes, Sparkles, TerminalSquare, Crown, Tv, Briefcase, FileText, Store, Activity, PenLine, BookOpen, ScrollText, Orbit, Scale, Hammer, Rows3, History, Globe as GlobeIcon, type LucideIcon } from "lucide-react";
import { openChat } from "./lib/chatBus.ts";
import { LauncherButton } from "./Launcher.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import { usePulseUI } from "./play/pulseUI.ts";
import type { PulseEvent } from "./play/pulse.ts";
import { surfaces, siteRooms, type Surface } from "./data/surfaces.ts";
import { AltitudeRail } from "./world/AltitudeRail.tsx";
import { altitudeFor } from "./world/altitude.ts";
import { prefersReducedMotion } from "./world/reducedMotion.ts";
import { navigateWithViewTransition } from "./lib/viewTransition.ts";

/**
 * The room registry and the chrome every room route wears.
 *
 * These used to live in Playground.tsx alongside the hub page itself, which was
 * fine until the hub grew a shared realtime layer: App.tsx imports ROOMS and
 * /map, /lab and /forge import RoomFrame, so one static import chain was enough
 * to pull playhtml's ~75 kB into the landing page's bundle. Splitting the
 * registry out from the page keeps the weight where it is actually used -
 * /playground, /blueprint and /pulse - and leaves the rest of the site paying
 * nothing for a feature it doesn't render.
 */

export type Room = Surface & { icon: LucideIcon };

/**
 * The one React-only half of a surface.
 *
 * Icons are React values, and `src/data/surfaces.ts` must stay importable by
 * `scripts/gen-system-prompt.mjs` (a Node script can't import this .tsx and
 * shouldn't resolve lucide-react), so the icon lives here and everything else
 * - label, blurb, tag, tint, device, group - lives in the registry. `tint`
 * moved to the registry because it is a plain string and the wall needs it
 * without pulling in React.
 *
 * Keyed by every surface, not just rooms: the homepage wall renders all
 * sixteen. `surfaces.test.ts` fails if a surface has no entry here.
 */
export const SURFACE_ICON: Record<string, LucideIcon> = {
  "/compose": Smartphone,
  "/lab": FlaskConical,
  "/blueprint": Compass,
  "/map": Boxes,
  "/globe": GlobeIcon,
  "/forge": Sparkles,
  "/terminal": TerminalSquare,
  "/chess": Crown,
  "/weeb": Tv,
  "/hire": Briefcase,
  "/resume": FileText,
  "/shipped": Store,
  "/pulse": Activity,
  "/ink": PenLine,
  "/excelsior": BookOpen,
  "/loopdown": ScrollText,
  "/anthology": Orbit,
  "/canon": Scale,
  "/making": Hammer,
  "/playground": LayoutGrid,
  "/ops": Gauge,
  "/lanes": Rows3,
  "/time-machine": History,
};

/** Every surface with its icon attached - what the wall renders. */
export const SURFACES: Room[] = surfaces.map((s) => ({ ...s, icon: SURFACE_ICON[s.to] ?? LayoutGrid }));

/** The full-screen rooms, in pager order. */
export const ROOMS: Room[] = siteRooms.map((r) => ({ ...r, icon: SURFACE_ICON[r.to] ?? LayoutGrid }));

/**
 * Shared full-screen chrome for every room route.
 *
 * Two things this now fixes, both found by auditing the whole site at once:
 *
 * 1. NO DEAD ENDS. Every room used to offer only two ways out - back to the hub
 *    or back to the portfolio - so the rooms were leaves hanging off a hub with
 *    no edges between them. A visitor who liked one room had no way to discover
 *    its neighbour except by going back and choosing again. The pager at the
 *    foot loops the rooms into each other, the same device `NextProject` already
 *    gives the case studies.
 *
 * 2. ⌘K EVERYWHERE. The command palette - the one control that can reach every
 *    surface on this site - was mounted inside HomePage(), so it existed on `/`
 *    and nowhere else. Mounting it here gives it to every room. (The remaining
 *    routes that don't use RoomFrame still need it; see the audit.)
 */
// The room after this one, wrapping at the end. Derived from the same
// `siteRooms` order the hub and the assistant's prompt both read, so the
// three can never disagree about what follows what.
//
// Every room-chrome variant calls this hook - RoomFrame (5 rooms) plus
// BlueprintRoom, Terminal and ComposePlayground, which each draw their own
// header and reuse only the pager - so it is the one place a mount-time
// `room:<slug>` pulse bump reaches every entry path: backtick, the palette,
// the pager link, or a pasted URL. Previously that count only bumped from
// RoomCard's onClick in RoomGrid, which is why /pulse undercounted every
// other way into a room; usePulse's own 1s dedupe makes a click-then-mount
// in the same second collapse to one, so there is nothing to double-count.
//
// `usePulseUI`, not `usePulse` - this hook runs from every room, including
// ones a node-environment test reaches through nothing more than an icon
// import (surfaces.test.ts imports SURFACE_ICON from here). `usePulse`
// pulls in `@playhtml/react`, which reads `document` the moment it is
// imported (see pulseUI.ts's own docstring for the SSR crash this caused
// RoomGrid before); routing through the context keeps every route that
// isn't wrapped in a live PulseContext.Provider a safe no-op instead of a
// crash. See __root.tsx for where that provider is actually mounted.
export function useNextRoom(): Room | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const here = ROOMS.findIndex((r) => r.to === pathname);
  const { bump } = usePulseUI();
  useEffect(() => {
    if (here !== -1) bump(`room:${ROOMS[here].to.slice(1)}` as PulseEvent);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return here === -1 ? null : ROOMS[(here + 1) % ROOMS.length];
}

/**
 * The pager link itself, factored out of RoomFrame's footer so a room that
 * draws its own chrome (D1: BlueprintRoom, ComposePlayground, Terminal) can
 * still carry the one control every other room gets for free, instead of
 * three hand-copies of this markup drifting apart.
 */
export function NextRoomLink({ next, className = "" }: { next: Room; className?: string }) {
  const navigate = useNavigate();
  return (
    <Link
      to={next.to}
      className={`ctrl group flex items-center justify-between gap-4 ${className}`}
      // Real <Link> kept (real href, crawlable) — the click is intercepted
      // only to run the same startViewTransition/fallback/instant contract
      // AltitudeRail.tsx already proved, via the shared helper (§2, Lane 7),
      // instead of the router's own instant swap.
      onClick={(e) => {
        e.preventDefault();
        navigateWithViewTransition(() => navigate({ to: next.to }), prefersReducedMotion());
      }}
    >
      <span className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: `${next.tint}55`, color: next.tint }}
        >
          <next.icon size={15} />
        </span>
        <span>
          <span className="kicker block">next room</span>
          <span className="font-display text-sm font-bold text-zinc-100 transition group-hover:text-accent">
            {next.label}
          </span>
        </span>
      </span>
      <span aria-hidden className="text-xl text-accent transition group-hover:translate-x-1.5">→</span>
    </Link>
  );
}

/**
 * D1: for a room with no footer of its own (BlueprintRoom, Terminal) - the
 * same pager RoomFrame gives every other room, in its own landmark. A room
 * that already draws a `<footer>` (ComposePlayground) uses `useNextRoom` +
 * `NextRoomLink` directly instead, folded into that existing footer.
 */
export function RoomPagerFooter() {
  const next = useNextRoom();
  if (!next) return null;
  return (
    <footer data-spine="room-pager" className="border-t border-line bg-ink/80">
      <NextRoomLink next={next} className="mx-auto max-w-7xl px-4 py-4 sm:px-6" />
    </footer>
  );
}

export function RoomFrame({ title, tagline, children }: { title: string; tagline: string; children: ReactNode }) {
  const { goToSection } = useSectionNav();
  // The altitude rail (living-ledger-spec.md#6.2) only makes sense on the two
  // rooms that ARE altitudes other than STREET: /map (ORBIT) and /globe
  // (GLOBE). Every other RoomFrame room (chess, weeb, lab, forge, terminal,
  // blueprint, compose) falls back to "street" from altitudeFor and renders
  // nothing here; STREET's own copy of the rail is AltitudeRailV2.tsx,
  // mounted into world-v2's HUD instead, not here.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showAltitudeRail = altitudeFor(pathname) !== "street";
  return (
    <div className="flex min-h-screen flex-col bg-void">
      <SiteHeader>
        <nav className="mx-auto flex max-w-7xl flex-nowrap items-center justify-between gap-1 px-2 py-1 sm:gap-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {/* Was a link to /playground - the hub that lists the rooms. The
                launcher shows the same set without leaving the room, which is
                the difference between "go back and choose again" and moving
                sideways. /playground is still a route and still on the wall. */}
            <LauncherButton className="min-h-11 min-w-11 justify-center" />
            <button
              type="button"
              onClick={() => goToSection("top")}
              className="ctrl flex min-h-11 min-w-11 items-center justify-center gap-1.5 text-sm text-muted hover:text-accent"
            >
              <ArrowLeft size={14} /> <span className="label-wide">Portfolio</span>
            </button>
          </div>
          {/* Phones keep the room title beside every navigation control.
              The full tagline returns at sm; the h1 below always keeps it. */}
          <span className="kicker min-w-0 flex-1 truncate">
            {title}<span className="hidden sm:inline"> · {tagline}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {showAltitudeRail && <AltitudeRail />}
            <button
              onClick={() => openChat()}
              data-globe-chat={pathname === "/globe" ? true : undefined}
              className={`${pathname === "/globe" ? "chat-launcher " : ""}ctrl min-h-11 min-w-11 rounded-full bg-accent px-2 py-1.5 text-sm font-semibold text-ink hover:bg-accent-dim sm:px-4`}
            >
              Ask <span className="label-wide">my AI</span>
            </button>
          </div>
        </nav>
      </SiteHeader>
      <main id="main-content" tabIndex={-1} className="min-h-0 flex-1">
        {/* Every room route is single-purpose full-screen chrome (no scrollable
            page around it), so it never gets its own visible <h1> - this one
            is screen-reader-only, keeping heading order sane (the room's own
            content, e.g. LabBench's h2, follows it) without duplicating the
            title bar's visible text above. */}
        <h1 className="sr-only">{title} · {tagline}</h1>
        {children}
      </main>
      {/* The onward path. Without this a room is a leaf: the only exits were
          "back to the hub" and "back to the portfolio", so the rooms never led
          to each other and the deepest work on the site was the hardest to
          stumble into. Same component BlueprintRoom and Terminal render for
          their own hand-drawn chrome - one footer, not three copies. */}
      <RoomPagerFooter />
    </div>
  );
}
