import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, FlaskConical, Smartphone, Compass, Boxes, Sparkles, TerminalSquare, type LucideIcon } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { useSectionNav } from "./lib/navigation.ts";

/**
 * The Playground — one full-screen hub for every interactive world on the site.
 * These used to be scattered down the scroll and behind hotkeys; gathering them
 * behind one door makes the point explicit: this portfolio is a running program,
 * and each room is a small proof of the engineering the CV describes.
 *
 * Each room is its own route (rendered one at a time, so only one canvas / WebGL
 * context is ever live) and shares the RoomFrame chrome below.
 */

type Room = {
  to: string;
  label: string;
  blurb: string;
  tag: string;
  icon: LucideIcon;
  tint: string;
};

export const ROOMS: Room[] = [
  {
    to: "/compose",
    label: "Compose Playground",
    blurb: "Write Jetpack Compose, watch it recompose live in a phone frame — reactive state, animation, and an AI that writes it for you.",
    tag: "live editor · AI",
    icon: Smartphone,
    tint: "#3ddc84",
  },
  {
    to: "/lab",
    label: "The Lab Bench",
    blurb: "Nine experiments that prove the numbers — Dice.tech's production metrics plus five personal builds (Mileway, PaymentsLab, Kursi, HireSignal, Deadlock) — running in your browser.",
    tag: "canvas · physics",
    icon: FlaskConical,
    tint: "#5ee6ff",
  },
  {
    to: "/blueprint",
    label: "The Blueprint Room",
    blurb: "The whole portfolio as an infinite canvas — a real-time 3D fly-through, an ASCII render of the same scene, and a sketchable whiteboard.",
    tag: "3D · WebGL",
    icon: Compass,
    tint: "#db61ff",
  },
  {
    to: "/map",
    label: "The 3D Storyboard",
    blurb: "The projects and the ideas that connect them, as a constellation you can orbit — every edge is a real dependency.",
    tag: "3D · graph",
    icon: Boxes,
    tint: "#f0883e",
  },
  {
    to: "/forge",
    label: "The Particle Forge",
    blurb: "A few thousand particles, each spring-tied to a letter, parting around your cursor and snapping back. Physics on a canvas.",
    tag: "canvas · interactive",
    icon: Sparkles,
    tint: "#3ddc84",
  },
  {
    to: "/terminal",
    label: "The Terminal",
    blurb: "A faux shell you can actually type in — ls the site, cat a project, or hit the backtick key from anywhere.",
    tag: "text · easter egg",
    icon: TerminalSquare,
    tint: "#5ee6ff",
  },
];

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

function RoomCard({ r, i }: { r: Room; i: number }) {
  const Icon = r.icon;
  return (
    <Link
      to={r.to}
      className="playground-card group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition hover:-translate-y-1"
      style={{ animationDelay: `${i * 60}ms` }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${r.tint}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl border transition"
          style={{ borderColor: `${r.tint}40`, background: `${r.tint}12`, color: r.tint }}
        >
          <Icon size={20} />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{r.tag}</span>
      </div>
      <h3 className="font-display mt-4 text-lg font-bold transition group-hover:text-accent">{r.label}</h3>
      <p className="mt-2 grow text-sm leading-relaxed text-zinc-400">{r.blurb}</p>
      <span className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] font-semibold" style={{ color: r.tint }}>
        enter →
      </span>
    </Link>
  );
}

export default function Playground() {
  const { goToSection } = useSectionNav();
  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => goToSection("top")}
            className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Back to portfolio</span>
          </button>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted lg:flex">
            <LayoutGrid size={13} className="text-accent" /> The Playground — every interactive room, one door
          </span>
          <button
            onClick={() => openChat()}
            className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
          >
            Ask <span className="hidden sm:inline">my AI</span>
          </button>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the playground</p>
        <h1 className="font-display text-hero font-bold tracking-tight">This site is a live demo</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Not a PDF with a pulse — a running program. Six interactive rooms, each a small proof of the
          engineering the rest of the site describes. Pick one and poke it.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROOMS.map((r, i) => (
            <RoomCard key={r.to} r={r} i={i} />
          ))}
        </div>

        <p className="mt-10 font-mono text-[11px] text-muted">
          tip: press <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-400">⌘K</kbd> or{" "}
          <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-400">`</kbd> to jump anywhere.
        </p>
      </main>
    </div>
  );
}
