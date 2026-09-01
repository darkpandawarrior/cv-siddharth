import { useState } from "react";
import {ArrowLeft, Activity } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import { PlayRoom, PresenceBadge } from "./play/PlayRoom.tsx";
import {
  PULSE_EVENTS,
  groupPulse,
  totalInteractions,
  touchedCount,
  usePulseCounts,
  type PulseEvent,
} from "./play/pulse.ts";
import { DayBars, useCountUp, useVisitorLedger } from "./play/Visitors.tsx";
import { isoDay, recentDays, sumDays, topZones, totalVisitors, type ZoneTally } from "./play/visitors.ts";

import { SiteFooter } from "./SiteFooter.tsx";
import { LauncherButton } from "./Launcher.tsx";
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

/* Group tints for the full-registry disclosure.
 *
 * These were three raw hex literals (#3ddc84, #5ee6ff, #db61ff) on a site whose
 * theme block owns every colour it ships: the same three colours, just
 * invisible to a theme swap and to anyone grepping for where green comes from.
 *
 * Three, and --color-warn is not the fourth. A port to tokens added it under a
 * note claiming "amber and cyan are deliberately not in here", which the array
 * itself disproved twice over — --color-warn is #f0883e against the reserved
 * --color-accent's #f2a13d, and --color-probe is #5ee6ff against the reserved
 * --color-accent2's #4fd6e0. It is also the site's WARNING channel, and a
 * display group has no warning state to earn it.
 *
 * The registry defines FIVE groups, so three tints cycle. That is fine here and
 * only here: every group sits under its own <h2> with its subtotal in text, so
 * the colour is decoration repeating a label rather than the encoding. It is
 * NOT reused by the region bar further down, which needs adjacent slices to
 * differ and has its own neutral ramp for exactly that reason. */
const TINTS = ["var(--color-signal)", "var(--color-probe)", "var(--color-alt)"];

/**
 * The world bar's own ramp: one neutral token, stepped.
 *
 * Not TINTS. The two funnel bars 200px above this render probe-cyan for "came
 * in" and signal-green for "things done inside"; drawing Asia and Europe in
 * that same pair made one screen where cyan meant four different things. A
 * region is a category with no state and no magnitude ordering worth a hue, so
 * it gets lightness steps off --color-text-dim, which carries no meaning
 * anywhere on this site.
 *
 * ponytail: linear down to a 30% floor. Past ~6 regions adjacent steps stop
 * being tellable apart — fine, because the legend beside the bar is the text
 * and the bar is aria-hidden. Give it a real categorical scale only if the
 * world section ever leads with the bar instead of the list.
 */
const regionTint = (i: number, n: number) =>
  `color-mix(in srgb, var(--color-text-dim) ${Math.max(30, 100 - i * (70 / Math.max(1, n - 1)))}%, transparent)`;

/* The window the trace draws. Sixty days is what the old ledger panel showed
 * and what recentDays zero-fills, so the shape of the chart is unchanged — only
 * where it sits on the page. */
const TRACE_SPAN = 60;

/* How many things this site counts, read off the registry rather than typed
 * into the copy. "N of M" is a claim about coverage, and a hardcoded M starts
 * lying the day the registry gains an event — which it has: registering
 * `room:weeb` moved this number, and no copy on the page needed touching. */
const EVENT_COUNT = Object.keys(PULSE_EVENTS).length;

/**
 * Which rooms count what happens inside them, and which only count the door.
 *
 * Derived from the registry rather than listed by hand, because the copy below
 * names the unmeasured rooms out loud — and a hand-written list of them is
 * wrong the moment somebody wires a counter into the Lab Bench and forgets
 * this page exists. An event is "inside" a room when it carries that room's own
 * prefix: `room:blueprint` owns `blueprint:*`, `room:chess` owns `chess:*`.
 */
const ROOMS = (Object.keys(PULSE_EVENTS) as PulseEvent[])
  .filter((event) => event.startsWith("room:"))
  .map((entry) => {
    const prefix = `${entry.slice("room:".length)}:`;
    return {
      entry,
      label: PULSE_EVENTS[entry].label,
      inside: (Object.keys(PULSE_EVENTS) as PulseEvent[]).filter((event) => event.startsWith(prefix)),
    };
  });
const MEASURED_ROOMS = ROOMS.filter((room) => room.inside.length > 0);
const DOOR_ONLY_ROOMS = ROOMS.filter((room) => room.inside.length === 0);
/* Counted, and attached to no door at all — neither a room entry nor a room's
 * inside. They are the reason the second aside exists. */
const UNATTACHED = (Object.keys(PULSE_EVENTS) as PulseEvent[]).filter(
  (event) => !ROOMS.some((room) => room.entry === event || room.inside.includes(event)),
);

/** "a, b and c" — the one place this page builds a sentence out of a list. */
function sentenceList(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function PulseInner() {
  const { goToSection } = useSectionNav();
  const counts = usePulseCounts();
  const groups = groupPulse(counts);
  const total = totalInteractions(counts);
  const ledger = useVisitorLedger();
  const people = totalVisitors(ledger);
  const days = recentDays(ledger, isoDay(new Date()), TRACE_SPAN);
  const visits = sumDays(days);
  const todayCount = days[days.length - 1]?.count ?? 0;
  /* The old ledger panel returned null until the socket had landed. That was
   * free at the bottom of the page and is not free here: the trace is now the
   * second thing on the page, so a chart that appears late shoves everything
   * below it down. The height is reserved unconditionally (below) and only the
   * bars wait on this. */
  const knowsRoom = people > 0 || visits > 0;

  /* The first total that actually exists — not the zero this page renders with
     before the shared document arrives. The run-up and the session delta both
     hang off it, and both are wrong if they use mount instead.

     Adjusted during render rather than in an effect: React discards this pass
     and re-runs before committing, so the seed is in place for the very first
     frame that has a total, with no extra paint and no cascading render. */
  const [arrived, setArrived] = useState(0);
  if (arrived === 0 && total > 0) setArrived(total);
  /* One: the run-up. useCountUp restarts its whole animation whenever its
     target moves, which is right for the plaque's frozen number and wrong for
     a figure that ticks — left armed, the headline would drop to zero and
     climb back every time somebody, somewhere, poked a room. So it is armed
     only while the displayed total is still the first one that landed. */
  const shownTotal = useCountUp(total, arrived > 0 && arrived === total);
  /* Two: the delta. "Since you opened this page" is measured from the first
     real total rather than from mount, because at mount the socket has not
     delivered anything and the total is zero — a mount-time seed would count
     the document's first payload as activity and greet every visitor with
     "+412 since you opened this page".

     This is also the only live claim this data can carry. pulse-v1 stores bare
     counts and no timestamps, so "last touched 40 seconds ago" would be a
     number with nothing behind it. A delta the visitor's own session observed
     is theirs to check. */
  const delta = arrived > 0 ? Math.max(0, total - arrived) : 0;
  // One scale across the whole page, so a bar's length means the same thing in
  // every group — per-group scaling would make a room with 3 visits look as
  // busy as one with 300.
  const max = Math.max(1, ...groups.flatMap((g) => g.rows.map((r) => r.count)));
  const touched = touchedCount(counts);
  /* Every counted thing, busiest first — the order both the strip and the top
   * five read in. Ties break on the label so the ranking is stable between
   * renders and between visitors, the same reason groupPulse follows the
   * registry's order rather than the document's key order. */
  const ranked = groups
    .flatMap((g) => g.rows)
    .slice()
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const top5 = ranked.slice(0, 5);
  /* The leaderboard gets its own ruler. That is allowed here and nowhere else
   * on the page precisely because the thing is labelled a leaderboard: five
   * rows compared against each other, and the page-wide `max` is still what
   * every one of the registry's rows below uses. */
  const top5Max = Math.max(1, ...top5.map((r) => r.count));

  const funnels = MEASURED_ROOMS.map((room) => ({
    label: room.label,
    entered: counts[room.entry] ?? 0,
    engaged: room.inside.reduce((sum, event) => sum + (counts[event] ?? 0), 0),
  }));
  // One ruler across both funnels: the point of putting them side by side is
  // that the Blueprint Room and the Board are comparable to each other.
  const funnelMax = Math.max(1, ...funnels.flatMap((f) => [f.entered, f.engaged]));
  const alsoHappening = UNATTACHED.filter((event) => (counts[event] ?? 0) > 0);

  const zones = topZones(ledger);
  /* Zones folded into their own regions, busiest region first. `region` has
     been computed on every zone since visitors.ts's topZones was written and
     has never been rendered anywhere — this is the first thing to draw it. */
  const regions: { region: string; count: number; zones: ZoneTally[] }[] = [];
  for (const zone of zones) {
    const bucket = regions.find((r) => r.region === zone.region);
    if (bucket) {
      bucket.count += zone.count;
      bucket.zones.push(zone);
    } else {
      regions.push({ region: zone.region, count: zone.count, zones: [zone] });
    }
  }
  regions.sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
  const zoneTotal = regions.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* This was a Link to /playground wearing LauncherButton's exact
                class string. Same pill, same icon, same hover — and it
                navigated instead of opening the surfaces wall, so /pulse's
                header looked like every other room's and behaved differently.
                Looking identical while doing something else is worse than
                looking different. */}
            <LauncherButton />
            <button
              type="button"
              onClick={() => goToSection("top")}
              className="flex items-center gap-1.5 text-sm text-muted transition hover:text-accent"
            >
              <ArrowLeft size={14} /> <span className="label-wide">Portfolio</span>
            </button>
          </div>
          <span className="kicker hidden items-center gap-2 lg:flex">
            <Activity size={13} className="text-accent" /> The Pulse — what visitors actually touch
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* No longer phone-hidden. It already renders nothing below two
                people in the room (PlayRoom.tsx), so it costs a narrow header
                no width when it is empty, and when it is not it is the most
                literally live element on the site — on the one page whose
                whole argument is that this thing is running. */}
            <PresenceBadge />
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="label-wide">my AI</span>
            </button>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="section-y mx-auto w-full max-w-5xl flex-1 px-6">
        <p className="section-eyebrow mb-2">// the pulse</p>
        <p className="kicker mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="pulse-live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          live · this moves while you are looking at it
        </p>
        <h1 className="font-display text-hero font-bold tracking-tight">
          {/* aria-hidden on the figures only: the <h1> keeps its heading role
              and its place in the document outline, while the numbers are
              announced once by the status region above instead of twice. */}
          {/* Keyed on the delta so a new tick remounts this span and replays
              the one-shot flash; a CSS animation will not restart on an element
              that never left the tree.

              NO WIDTH RESERVATION, and that is the measured call rather than an
              omission. A `min-width` in `ch` was tried here to stop the run-up
              from reflowing the line as it gains digits: `ch` is the advance of
              the "0" GLYPH, not of a tabular figure, so `3ch` came out ~9.5px
              wider than the "494" it was reserving for — enough to wrap
              `people` onto a second line and displace the whole page by 63px.
              Re-measured over three paired loads: with the reservation, CLS
              0.0337 in 2 shifts; without it, 0.0054 in 4-5. The reservation was
              ~85% of this page's layout shift. `tabular-nums` alone already
              holds every digit at one width, so the run-up only ever reflows on
              a digit COUNT change — twice, at sub-0.002 each. If a reservation
              is ever wanted back, size it off a hidden {total} sizer span and
              never off `ch`. */}
          <span
            key={delta}
            className={`inline-block tabular-nums ${delta > 0 ? "pulse-flash" : ""}`}
            aria-hidden="true"
          >
            {shownTotal.toLocaleString()}
          </span>{" "}
          <span className="text-accent" aria-hidden="true">interaction{total === 1 ? "" : "s"}</span>
          {people > 0 && (
            /* aria-hidden like the figures beside it. Without this the only
               un-hidden text in the <h1> is "from 2,689 people", so a screen
               reader announces the page's one heading as a dangling
               prepositional phrase. The status region below reads the whole
               sentence, numbers included. */
            <span aria-hidden="true">
              {" "}
              <span className="text-muted">from</span>{" "}
              {people.toLocaleString()} <span className="text-accent2">{people === 1 ? "person" : "people"}</span>
            </span>
          )}
        </h1>
        {/* The headline above is live — it moves whenever anyone, anywhere,
            touches a room. Without this a screen-reader visitor is handed a
            number once and never told it changed, which is the one thing this
            page exists to show. Same shape as FloatingChat's voice status: a
            separate sr-only status node rather than aria-live on the <h1>,
            because making the heading itself a live region re-announces the
            whole heading and its markup on every tick.

            Deliberately `polite` and deliberately a single summary sentence
            rather than a region per row — 30-odd counters each announcing
            themselves would be unusable. */}
        <p role="status" aria-live="polite" className="sr-only">
          {total.toLocaleString()} interaction{total === 1 ? "" : "s"}
          {people > 0 ? ` from ${people.toLocaleString()} ${people === 1 ? "person" : "people"}` : ""}.{" "}
          {touched} of {EVENT_COUNT} things touched so far.
        </p>
        {delta > 0 && (
          <p className="mt-2 font-mono text-sm text-signal">+{delta} since you opened this page</p>
        )}
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Every room on this site writes to one shared counter. This is the whole of it — what gets opened,
          what gets played with, and what nobody has touched yet.
        </p>
        <p className="mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
          Counted per browser, not per person, and forgeable by anyone with a console — the full accounting is
          at the foot of the page.
        </p>

        <section className="mt-12" aria-labelledby="pulse-trace">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <h2 id="pulse-trace" className="font-display text-lg font-bold tracking-tight">
              The last 60 days
            </h2>
            <span className="font-mono text-[11px] text-muted">{visits.toLocaleString()} in the window</span>
          </div>

          <div className="kicker mt-4 flex items-baseline justify-between gap-3">
            <span>visits · last {TRACE_SPAN} days</span>
            <span className="text-accent2">{todayCount} today</span>
          </div>
          {/* The reserved box. It holds its full height from first paint whether
              or not the websocket has delivered anything, because everything
              below it — the axis, the caveat, four more sections and the
              footnotes — would otherwise be pushed down the moment the socket
              lands. /pulse is audited for cumulative layout shift at
              error severity (lighthouserc.json), and a socket-fed chart at the
              top of a page is the textbook way to fail that audit.

              The height is deliberately modest, and this is a taste call, not
              a derived one — an earlier note here claimed a measured
              distribution ("58 of 60 days on the floor") that neither the
              production room (42 of 60 on the floor, top day 11 against a
              second of 8) nor localhost actually shows. What is true is what
              was looked at: at the counts this room holds, a 192px box read as
              a chart that had failed to load, which is the opposite of the
              "this thing is running" claim the trace was promoted up here to
              make. A shorter box keeps the reservation that protects CLS and
              still has room to breathe if the window ever fills in. */}
          <div className="mt-2 flex h-28 items-center sm:h-36">
            {knowsRoom ? (
              <DayBars days={days} liveEdge className="h-full w-full" />
            ) : (
              /* The empty state lives inside the reserved box rather than
                 replacing the caveat line below it, so swapping one for the
                 other can never change any element's height. */
              <p className="w-full font-mono text-[11px] text-muted">quiet — nothing counted in this window yet.</p>
            )}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
            <span>{days[0]?.day}</span>
            <span className="text-accent2">today</span>
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted">
            one browser, one line per day — refresh maths, not analytics.
          </p>

          {/* The chart's accessible alternative, and the only way to read an
              individual day without a mouse. Visible to everyone rather than
              sr-only: a sighted visitor curious about one date wants the same
              sixty rows a screen reader does, and a hidden table is a DOM cost
              paid by one audience for the benefit of another. */}
          <details className="mt-4">
            <summary className="cursor-pointer font-mono text-[11px] text-muted transition hover:text-accent">
              See every day
            </summary>
            <div className="mt-3 max-h-72 overflow-y-auto">
              <table className="w-full max-w-sm border-collapse text-left font-mono text-[11px]">
                <thead>
                  <tr className="text-muted">
                    <th scope="col" className="border-b border-line py-1 font-normal">
                      Day
                    </th>
                    <th scope="col" className="border-b border-line py-1 text-right font-normal">
                      Visits
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day} className={d.count > 0 ? "text-zinc-300" : "text-muted"}>
                      <td className="py-0.5">{d.day}</td>
                      <td className="py-0.5 text-right tabular-nums">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        {/* One finding read three ways gets one visual register. Three plain
            strings rather than three KPI tiles: tiles would give a 60-day mean
            the same weight as the trace it summarises. */}
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
          <span>{todayCount} today</span>
          <span>{(visits / TRACE_SPAN).toFixed(1)} a day, 60-day average</span>
          <a href="#pulse-doing" className="transition hover:text-accent">
            {touched} of {EVENT_COUNT} things touched
          </a>
        </p>

        <section className="mt-12" aria-labelledby="pulse-doing">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <h2 id="pulse-doing" className="font-display text-lg font-bold tracking-tight">
              What people actually do
            </h2>
            <span className="font-mono text-[11px] text-muted">{total.toLocaleString()} in all</span>
          </div>

          {/* This sentence is the accessible content for the strip below it —
              the strip is decoration that repeats it, not the other way round,
              so colour is never carrying the finding on its own. */}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {touched > 0
              ? `${touched} of ${EVENT_COUNT} things on this site are wired to count themselves. ${
                  EVENT_COUNT - touched
                } of them have never fired.`
              : `0 of ${EVENT_COUNT} channels have fired yet — you could be first.`}
          </p>

          {/* Sorted busiest-first, so the registry's booleans draw a Pareto silhouette
              for no extra ink. Lit is --color-signal and unlit is --color-probe
              behind an outline: the site's existing lit/idle pair, not a new
              palette invented for one strip. */}
          <ul aria-hidden="true" className="mt-4 flex flex-wrap gap-1.5">
            {ranked.map((r) => (
              <li
                key={r.event}
                title={`${r.label} — ${r.count.toLocaleString()}`}
                className={`h-3 w-3 rounded-[2px] ${r.count > 0 ? "bg-signal" : "border border-line bg-probe/15"}`}
              />
            ))}
          </ul>

          {touched > 0 && (
            <>
              <p className="kicker mt-8">top 5, right now</p>
              <ol className="mt-3 space-y-3">
                {top5.map((r, i) => (
                  <li key={r.event} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5">
                    <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm text-zinc-300">{r.label}</span>
                    <span className="font-mono text-sm tabular-nums text-signal">{r.count.toLocaleString()}</span>
                    <span className="col-span-3">
                      <Bar count={r.count} max={top5Max} tint="var(--color-signal)" />
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {/* Demoted, not cut. Every row in the registry is still here on
              one click, still on the page-wide scale, still including the ones
              nobody has touched — a dashboard that hides its zeroes is how a
              page starts flattering itself. What moved is only the default:
              nobody now scrolls a wall of zeroes to reach the trace. */}
          <details className="mt-10">
            <summary className="cursor-pointer font-mono text-[11px] text-muted transition hover:text-accent">
              See all {EVENT_COUNT}, including what nobody has touched yet
            </summary>
            <div className="mt-6 space-y-10">
              {groups.map((g, gi) => {
                const tint = TINTS[gi % TINTS.length];
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
          </details>
        </section>

        <section className="mt-12" aria-labelledby="pulse-funnels">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <h2 id="pulse-funnels" className="font-display text-lg font-bold tracking-tight">
              Doors opened vs things done
            </h2>
          </div>
          {/* Never a percentage, and the sentence says why rather than leaving
              it to be inferred. There is no session linkage anywhere in
              pulse-v1 — one visitor entering once and tripping five counters
              reads as 5 over 1 — so a figure typeset as "500%" would be a
              conversion rate the data cannot support. A multiplier can exceed
              one without claiming anything untrue. */}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Two rooms count both the door and what happens inside it. This is not a conversion rate — one
            visitor can trip five counters in one visit, so it is things done per visit, and it can be more
            than one.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {funnels.map((f) => (
              <div key={f.label}>
                <p className="text-sm leading-relaxed text-zinc-300">
                  {f.label} —{" "}
                  {f.entered > 0 && f.engaged > 0 ? (
                    <>
                      {f.entered.toLocaleString()} came in, {f.engaged.toLocaleString()} things done inside{" "}
                      <span className="text-muted">· {(f.engaged / f.entered).toFixed(1)}× per visit</span>
                    </>
                  ) : f.entered > 0 ? (
                    /* No multiplier at zero. "95 came in, 0 things done inside
                       · 0.0× per visit" typesets an arithmetic fact as a
                       verdict on the room, next to an empty bar — and the
                       ratio adds nothing the two counts have not said. */
                    <>
                      {f.entered.toLocaleString()} came in,{" "}
                      <span className="text-muted">nothing counted inside yet</span>
                    </>
                  ) : f.engaged > 0 ? (
                    /* Reachable: the door and the controls are separate keys in
                       a document anyone can write, so the inside can be ahead
                       of the entry. "Nobody in yet" would be flatly false here. */
                    <span className="text-muted">
                      {f.engaged.toLocaleString()} things done inside, and no door count to divide them by
                    </span>
                  ) : (
                    <span className="text-muted">nobody in yet</span>
                  )}
                </p>
                {/* The sentence above is the accessible content. These two are
                    the same two numbers as a length, on one scale. */}
                <div aria-hidden="true" className="mt-2 space-y-1.5">
                  <Bar count={f.entered} max={funnelMax} tint="var(--color-probe)" />
                  <Bar count={f.engaged} max={funnelMax} tint="var(--color-signal)" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
            {sentenceList(DOOR_ONLY_ROOMS.map((room) => room.label))} only know that you walked in. That is a
            gap in what gets measured, not a room nobody uses.
          </p>
          {/* "Also happening" has to be true of everything it then lists. The
              unfiltered registry printed "tidied the tiles back up 0×" inside a
              sentence whose first two words claim it is happening — two of the
              four items were zero on production. Filtered to what has fired,
              and the whole paragraph goes away when none of them has: the rows
              in the disclosure above still carry every zero, which is where a
              zero belongs. */}
          {alsoHappening.length > 0 && (
            <p className="mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
              Also happening, with no door event to measure it against:{" "}
              {/* The registry's own labels rather than nouns written for this
                  sentence. They read as verb phrases, so the tally trails them —
                  a hand-written "N tile rearrangements" reads better and is
                  wrong the day the registry gains another event. */}
              {sentenceList(
                alsoHappening.map((event) => `${PULSE_EVENTS[event].label.toLowerCase()} ${(counts[event] ?? 0).toLocaleString()}×`),
              )}
              .
            </p>
          )}
        </section>

        {zones.length > 0 && (
          <section className="mt-12" aria-labelledby="pulse-world">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
              <h2 id="pulse-world" className="font-display text-lg font-bold tracking-tight">
                Where in the world
              </h2>
              <span className="font-mono text-[11px] text-muted">
                {zones.length} time zone{zones.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              The only location a browser gives up without being asked is the name of its own clock's time
              zone. No address, no IP, no cookie — just that.
            </p>

            {regions.length === 1 ? (
              <p className="mt-6 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
                Every zone recorded so far is in {regions[0].region} — not enough spread yet to call this a
                map.
              </p>
            ) : (
              <>
                {/* The bar is decoration and says so: it is aria-hidden, and
                    the legend below is the only place these figures exist as
                    text. Colour alone never carries a region here. */}
                <div aria-hidden="true" className="mt-6 flex h-7 max-w-2xl overflow-hidden rounded-full">
                  {regions.map((r, i) => (
                    <span
                      key={r.region}
                      style={{ width: `${(r.count / zoneTotal) * 100}%`, background: regionTint(i, regions.length) }}
                    />
                  ))}
                </div>
                {/* Shares of the zones this page shows. topZones caps at forty,
                    so on a site that ever collects more than that these are a
                    share of the shown forty, not of every zone ever seen. */}
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[11px] text-muted">
                  {regions.map((r, i) => (
                    <li key={r.region} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: regionTint(i, regions.length) }}
                      />
                      {r.region} · {r.count.toLocaleString()} · {Math.round((r.count / zoneTotal) * 100)}%
                    </li>
                  ))}
                </ul>
              </>
            )}

            {regions.map((r, i) => (
              <div key={r.region} className="mt-6">
                <p className="kicker flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: regionTint(i, regions.length) }}
                  />
                  {r.region}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {r.zones.map((z) => (
                    <li
                      key={z.zone}
                      title={`${z.zone} — ${z.count} visitor${z.count === 1 ? "" : "s"}`}
                      className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs text-zinc-300"
                    >
                      {z.place}
                      <span className="font-mono text-[10px] text-muted">{z.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

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
      {/* surfaces.ts types this a "page"-kind surface, and the registry
          docs promise those get the footer. These two were the exceptions:
          ordinary scroll pages that dead-ended with no sitemap out. */}
      <SiteFooter />
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
