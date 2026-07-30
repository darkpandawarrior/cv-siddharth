import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, FlaskConical, Smartphone, Compass, Boxes, Sparkles, TerminalSquare, Crown, type LucideIcon } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
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
};

export const ROOMS: Room[] = siteRooms.map((r) => ({
  ...r,
  ...(ROOM_STYLE[r.to] ?? { icon: LayoutGrid, tint: "#3ddc84" }),
}));

/** Shared full-screen chrome for every room route (Lab Bench, Storyboard,
 *  Forge). Keeps a consistent way back to the hub and the portfolio. */
export function RoomFrame({ title, tagline, children }: { title: string; tagline: string; children: ReactNode }) {
  const { goToSection } = useSectionNav();
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
          <button
            onClick={() => openChat()}
            className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
          >
            Ask <span className="hidden sm:inline">my AI</span>
          </button>
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
    </div>
  );
}
