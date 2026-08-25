import { Link } from "@tanstack/react-router";
import { ROOMS, type Room } from "./rooms.tsx";
import { usePulseUI } from "./play/pulseUI.ts";
import type { PulseEvent } from "./play/pulse.ts";

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
  // Through context, not an import: RoomGrid is the page a no-WebGL visitor
  // actually reads on /playground, so it has to survive being rendered on the
  // server, and pulse.ts cannot be.
  const { counts, bump } = usePulseUI();
  // "room:blueprint" for "/blueprint" — the registry keys are named off the
  // routes so a new room needs one entry in PULSE_EVENTS and nothing here.
  const event = `room:${r.to.slice(1)}` as PulseEvent;
  const visits = counts[event] ?? 0;
  return (
    <Link
      to={r.to}
      onClick={() => bump(event)}
      className="panel playground-card group flex h-full flex-col p-5 transition hover:-translate-y-1"
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
      {/* h2, not h3. The cards sit directly under the page's h1 with no
          grouping heading between, so h3 skipped a level. Lighthouse scores
          that as a real accessibility failure and /playground is in
          lighthouserc.json's URL list with accessibility asserted at 1, but it
          could never report it while the route was ssr:false and painted
          nothing for it to read. The e2e axe pass did not catch it either:
          heading-order is a moderate rule and that suite fails only on serious
          and critical. Size is set by the class, so nothing moves. */}
      <h2 className="font-display mt-4 text-lg font-bold transition group-hover:text-accent">{r.label}</h2>
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
