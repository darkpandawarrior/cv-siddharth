import { Link } from "@tanstack/react-router";
import { ArrowLeft, Activity, LayoutGrid } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import { ROOMS, type Room } from "./rooms.tsx";
import { PlayRoom, PresenceBadge } from "./play/PlayRoom.tsx";
import { GuestWall, GUEST_WALL_ENABLED } from "./play/GuestWall.tsx";
import { Sandbox } from "./play/Sandbox.tsx";
import { usePulse, usePulseCounts, type PulseEvent } from "./play/pulse.ts";

/**
 * The Playground — one full-screen hub for every interactive world on the site.
 * These used to be scattered down the scroll and behind hotkeys; gathering them
 * behind one door makes the point explicit: this portfolio is a running program,
 * and each room is a small proof of the engineering the CV describes.
 *
 * Each room is its own route (rendered one at a time, so only one canvas / WebGL
 * context is ever live) and shares the RoomFrame chrome below.
 */

function RoomCard({ r, i }: { r: Room; i: number }) {
  const Icon = r.icon;
  const counts = usePulseCounts();
  const bump = usePulse();
  // "room:blueprint" for "/blueprint" — the registry keys are named off the
  // routes so a new room needs one entry in PULSE_EVENTS and nothing here.
  const event = `room:${r.to.slice(1)}` as PulseEvent;
  const visits = counts[event] ?? 0;
  return (
    <Link
      to={r.to}
      onClick={() => bump(event)}
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
      <span className="mt-4 flex items-center justify-between gap-2 font-mono text-[11px] font-semibold" style={{ color: r.tint }}>
        enter →
        {visits > 0 && (
          <span className="font-normal text-muted" title="How many times this room has been opened, across everyone">
            {visits.toLocaleString()} {visits === 1 ? "visit" : "visits"}
          </span>
        )}
      </span>
    </Link>
  );
}

export default function Playground() {
  // Everything shared on this page — presence, the tile counts, the sandbox and
  // the wall — reads from this one room.
  return (
    <PlayRoom>
      <PlaygroundInner />
    </PlayRoom>
  );
}

function PlaygroundInner() {
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
          <div className="flex items-center gap-2 sm:gap-3">
            <PresenceBadge className="hidden sm:flex" />
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="hidden sm:inline">my AI</span>
            </button>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the playground</p>
        <h1 className="font-display text-hero font-bold tracking-tight">This site is a live demo</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Not a PDF with a pulse — a running program. Six interactive rooms, each a small proof of the
          engineering the rest of the site describes. Pick one and poke it.
        </p>
        <Link
          to="/pulse"
          className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted transition hover:text-accent"
        >
          <Activity size={12} /> see what everyone else has been touching →
        </Link>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROOMS.map((r, i) => (
            <RoomCard key={r.to} r={r} i={i} />
          ))}
        </div>

        <Sandbox />
        {GUEST_WALL_ENABLED && <GuestWall />}

        <p className="mt-10 font-mono text-[11px] text-muted">
          tip: press <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-400">⌘K</kbd> or{" "}
          <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-400">`</kbd> to jump anywhere.
        </p>
      </main>
    </div>
  );
}
