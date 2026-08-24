import { Link } from "@tanstack/react-router";
import { ROOMS, type Room } from "./rooms.tsx";
import { usePulse, usePulseCounts, type PulseEvent } from "./play/pulse.ts";

/**
 * The card grid — extracted verbatim from Playground.tsx (see that file's
 * history) so it can serve two roles at once: the always-reachable "List
 * view" a visitor can flip to from the 3D world, and the no-WebGL /
 * reduced-motion / print fallback the world never gets a chance to break.
 * Because it's the fallback, it must never degrade — same markup, same
 * classes, same pulse counters, same stagger as what shipped before the
 * world existed.
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
        <span className="kicker">{r.tag}</span>
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

export function RoomGrid() {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ROOMS.map((r, i) => (
        <RoomCard key={r.to} r={r} i={i} />
      ))}
    </div>
  );
}
