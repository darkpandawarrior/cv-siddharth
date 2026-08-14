import { Link } from "@tanstack/react-router";
import { ArrowLeft, Activity, LayoutGrid } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import { PlayRoom, PresenceBadge } from "./play/PlayRoom.tsx";
import { groupPulse, totalInteractions, usePulseCounts } from "./play/pulse.ts";
import { VisitorLedgerPanel, useVisitorLedger } from "./play/Visitors.tsx";
import { totalVisitors } from "./play/visitors.ts";

/**
 * /pulse — what visitors actually do here, counted across everyone.
 *
 * The rooms are the claim ("this portfolio is a running program"); this is the
 * evidence. It reads the same shared document the rooms write to, so a number
 * moving on this page is somebody, somewhere, poking the thing it names.
 *
 * The page is candid about what the numbers are worth. They live in a public
 * playhtml room today, which means they are client-writable and anyone
 * determined enough can inflate them. That is fine for a counter whose job is
 * to make the site feel inhabited, and not fine for a number anyone should
 * quote — so the page says so rather than implying analytics-grade rigour.
 */

function Bar({ count, max, tint }: { count: number; max: number; tint: string }) {
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-line/60">
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
        style={{ width: `${max > 0 ? Math.max((count / max) * 100, count > 0 ? 3 : 0) : 0}%`, background: tint }}
      />
    </span>
  );
}

const GROUP_TINTS = ["#3ddc84", "#5ee6ff", "#db61ff"];

function PulseInner() {
  const { goToSection } = useSectionNav();
  const counts = usePulseCounts();
  const groups = groupPulse(counts);
  const total = totalInteractions(counts);
  const people = totalVisitors(useVisitorLedger());
  // One scale across the whole page, so a bar's length means the same thing in
  // every group — per-group scaling would make a room with 3 visits look as
  // busy as one with 300.
  const max = Math.max(1, ...groups.flatMap((g) => g.rows.map((r) => r.count)));

  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/playground"
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-zinc-400 transition hover:border-accent hover:text-accent"
            >
              <LayoutGrid size={14} /> <span className="label-wide">Playground</span>
            </Link>
            <button
              type="button"
              onClick={() => goToSection("top")}
              className="flex items-center gap-1.5 text-sm text-muted transition hover:text-accent"
            >
              <ArrowLeft size={14} /> <span className="label-wide">Portfolio</span>
            </button>
          </div>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted lg:flex">
            <Activity size={13} className="text-accent" /> The Pulse — what visitors actually touch
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <PresenceBadge className="hidden sm:flex" />
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="label-wide">my AI</span>
            </button>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="section-y mx-auto w-full max-w-4xl flex-1 px-6">
        <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the pulse</p>
        <h1 className="font-display text-hero font-bold tracking-tight">
          {total.toLocaleString()} <span className="text-accent">interaction{total === 1 ? "" : "s"}</span>
          {people > 0 && (
            <>
              {" "}
              <span className="text-zinc-500">from</span>{" "}
              {people.toLocaleString()} <span className="text-accent2">{people === 1 ? "person" : "people"}</span>
            </>
          )}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Every room on this site writes to one shared counter. This is the whole of it — what gets opened,
          what gets played with, and what nobody has touched yet.
        </p>

        <div className="mt-12 space-y-10">
          {groups.map((g, gi) => {
            const tint = GROUP_TINTS[gi % GROUP_TINTS.length];
            const subtotal = g.rows.reduce((s, r) => s + r.count, 0);
            return (
              <section key={g.group} aria-labelledby={`pulse-${gi}`}>
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2 id={`pulse-${gi}`} className="font-display text-lg font-bold tracking-tight">
                    {g.group}
                  </h2>
                  <span className="font-mono text-[11px] text-muted">{subtotal.toLocaleString()} total</span>
                </div>
                <ul className="mt-4 space-y-3">
                  {g.rows.map((r) => (
                    <li key={r.event} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
                      <span className={`text-sm ${r.count > 0 ? "text-zinc-300" : "text-muted"}`}>{r.label}</span>
                      <span className="font-mono text-sm tabular-nums" style={{ color: r.count > 0 ? tint : undefined }}>
                        {r.count.toLocaleString()}
                      </span>
                      <span className="col-span-2">
                        <Bar count={r.count} max={max} tint={tint} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <VisitorLedgerPanel />

        <p className="mt-12 max-w-2xl border-l-2 border-line pl-4 font-mono text-[11px] leading-relaxed text-muted">
          How this works: every counted action writes to one shared CRDT document over a websocket, so these
          numbers move live and outlive the tab that made them. They are also stored client-side, which makes
          them forgeable by anyone who opens a console — a deliberate trade for having no backend to run. Treat
          them as a sign of life, not as analytics.
        </p>
        <p className="mt-4 max-w-2xl border-l-2 border-line pl-4 font-mono text-[11px] leading-relaxed text-muted">
          What the visitor count is: one number per browser that has opened a room, kept apart from the
          interaction counts above. A person counts once, on a flag in their own browser — so clearing site
          data or opening a private window counts again, and a phone and a laptop count twice. It is a floor
          on people, not a measurement of them. The only thing recorded about anyone is the name of their time
          zone, straight from their clock, added to a tally and never to a row: no address, no cookie, no
          identifier, and nowhere to keep one even if I wanted it.
        </p>
      </main>
    </div>
  );
}

export default function Pulse() {
  return (
    <PlayRoom>
      <PulseInner />
    </PlayRoom>
  );
}
