import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, FlaskConical, Smartphone, Compass, Boxes, Sparkles, TerminalSquare, Crown, Tv, type LucideIcon } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import { siteRooms, type SiteRoom } from "./data/profile.ts";

/**
 * The room registry and the chrome every room route wears.
 *
 * These used to live in Playground.tsx alongside the hub page itself, which was
 * fine until the hub grew a shared realtime layer: App.tsx imports ROOMS and
 * /map, /lab and /forge import RoomFrame, so one static import chain was enough
 * to pull playhtml's ~75 kB into the landing page's bundle. Splitting the
 * registry out from the page keeps the weight where it is actually used —
 * /playground, /blueprint and /pulse — and leaves the rest of the site paying
 * nothing for a feature it doesn't render.
 */

export type Room = SiteRoom & {
  icon: LucideIcon;
  tint: string;
};

// Per-route presentation (React-only) merged onto the shared `siteRooms` data
// in profile.ts. The copy lives there because gen-system-prompt.mjs also reads
// it (a Node script can't import this .tsx) — so the AI assistant and this hub
// can never drift apart.
const ROOM_STYLE: Record<string, { icon: LucideIcon; tint: string }> = {
  "/compose": { icon: Smartphone, tint: "#3ddc84" },
  "/lab": { icon: FlaskConical, tint: "#5ee6ff" },
  "/blueprint": { icon: Compass, tint: "#db61ff" },
  "/map": { icon: Boxes, tint: "#f0883e" },
  "/forge": { icon: Sparkles, tint: "#3ddc84" },
  "/terminal": { icon: TerminalSquare, tint: "#5ee6ff" },
  // Gold is already this codebase's board/game colour — SearchTreeLab uses the
  // same value for Kursi's search tree, and the chess engine lab renders through
  // that renderer, so the two read as one family.
  "/chess": { icon: Crown, tint: "#e8c874" },
  "/weeb": { icon: Tv, tint: "#f2a13d" },
};

export const ROOMS: Room[] = siteRooms.map((r) => ({
  ...r,
  ...(ROOM_STYLE[r.to] ?? { icon: LayoutGrid, tint: "#3ddc84" }),
}));

/**
 * Shared full-screen chrome for every room route.
 *
 * Two things this now fixes, both found by auditing the whole site at once:
 *
 * 1. NO DEAD ENDS. Every room used to offer only two ways out — back to the hub
 *    or back to the portfolio — so the rooms were leaves hanging off a hub with
 *    no edges between them. A visitor who liked one room had no way to discover
 *    its neighbour except by going back and choosing again. The pager at the
 *    foot loops the rooms into each other, the same device `NextProject` already
 *    gives the case studies.
 *
 * 2. ⌘K EVERYWHERE. The command palette — the one control that can reach every
 *    surface on this site — was mounted inside HomePage(), so it existed on `/`
 *    and nowhere else. Mounting it here gives it to every room. (The remaining
 *    routes that don't use RoomFrame still need it; see the audit.)
 */
export function RoomFrame({ title, tagline, children }: { title: string; tagline: string; children: ReactNode }) {
  const { goToSection } = useSectionNav();
  // The room after this one, wrapping at the end. Derived from the same
  // `siteRooms` order the hub and the assistant's prompt both read, so the
  // three can never disagree about what follows what.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const here = ROOMS.findIndex((r) => r.to === pathname);
  const next = here === -1 ? null : ROOMS[(here + 1) % ROOMS.length];
  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/playground"
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-zinc-400 transition hover:border-accent hover:text-accent"
            >
              <LayoutGrid size={14} /> <span className="hidden sm:inline">Playground</span>
            </Link>
            <button
              type="button"
              onClick={() => goToSection("top")}
              className="flex items-center gap-1.5 text-sm text-muted transition hover:text-accent"
            >
              <ArrowLeft size={14} /> <span className="hidden sm:inline">Portfolio</span>
            </button>
          </div>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted lg:flex">
            {title} — {tagline}
          </span>
          <div className="flex items-center gap-2">
            <CommandPalette />
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="hidden sm:inline">my AI</span>
            </button>
          </div>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="min-h-0 flex-1">
        {/* Every room route is single-purpose full-screen chrome (no scrollable
            page around it), so it never gets its own visible <h1> — this one
            is screen-reader-only, keeping heading order sane (the room's own
            content, e.g. LabBench's h2, follows it) without duplicating the
            title bar's visible text above. */}
        <h1 className="sr-only">{title} — {tagline}</h1>
        {children}
      </main>
      {/* The onward path. Without this a room is a leaf: the only exits were
          "back to the hub" and "back to the portfolio", so the rooms never led
          to each other and the deepest work on the site was the hardest to
          stumble into. */}
      {next && (
        <footer className="border-t border-line bg-ink/80">
          <Link
            to={next.to}
            className="group mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6"
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
                <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">next room</span>
                <span className="font-display text-sm font-bold text-zinc-100 transition group-hover:text-accent">
                  {next.label}
                </span>
              </span>
            </span>
            <span aria-hidden className="text-xl text-accent transition group-hover:translate-x-1.5">→</span>
          </Link>
        </footer>
      )}
    </div>
  );
}
