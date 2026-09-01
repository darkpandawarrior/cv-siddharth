import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Ops, OpsRun } from "../api/_lib/ops-handler.ts";
import { perimeter, leverage, drift, opsGeneratedAt } from "./data/ops.ts";
import { MAX_AGE_DAYS, ageDays, stateForAge, type OpsState } from "./data/freshnessSla.ts";
import { fleet, fleetStats, storeGeneratedAt } from "./data/store.ts";
import { incidents } from "./data/incidents.ts";
import { projects } from "./data/profile.ts";
import { SiteFooter } from "./SiteFooter.tsx";
import { LauncherButton } from "./Launcher.tsx";

/**
 * /ops — a control loop rendered as a page.
 *
 * Every other surface on this site argues the work was good. This one argues
 * the work is STILL TRUE, and shows the machinery that would notice if it
 * stopped being. Spec: docs/ops-board.md.
 *
 * ── THE GRAMMAR ──────────────────────────────────────────────────────────
 * Four fields, in this order, and never a fifth:
 *
 *     LED   SUBJECT (+ its context)      STATE      VERIFIED
 *
 * The context is not a column — it is the rest of SUBJECT's line, the way a
 * console line has always been a fixed tag followed by a message. That is what
 * made it possible to stop truncating: 24 of 46 rows were being ellipsised,
 * and every incident row lost 20-50 characters of its actual point.
 *
 * ── WHY DEGRADED IS THE WHOLE IDEA ───────────────────────────────────────
 * Green-or-red is what GitHub already gives you. DEGRADED — passing,
 * succeeding daily, and quietly aging toward its deadline — is the state every
 * failure this board was built after actually lived in: a daily refresh red for
 * eight days with a green test suite, a 5,150-line generated file 21 days old
 * and invisible to its own alarm, a chess dataset 29 days stale with 16 more
 * days of legal silence still to run.
 *
 * ── WHAT IS ON SCREEN AT SECOND ZERO ─────────────────────────────────────
 * The escalation rail is sticky and holds the ACTUAL non-OK rows, not a
 * summary of them. A board about failure nobody noticed cannot make you scroll
 * to find the failure. Those rows stay in their own block below and that
 * block's census still counts them, because hoisting a row out silently would
 * make the block read clean when it is not.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────
 * Only BROKEN moves, in two places that are the same BROKEN thing: the LED
 * breathes, and the rail counts how long the worst row has been wrong.
 * Nothing else animates. Both stop under reduced motion, and BROKEN is still
 * carried by colour, a word and a static outline without them.
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────
 * Nothing on this page claims current access to an employer's code. The Dice
 * and Jugnoo work is measured history: public Play listings that anyone can
 * re-check, and counts taken once, during employment, from repos that are not
 * his and are not tracked here. The fleet block says so in its own note.
 */

const REPO = "https://github.com/darkpandawarrior/cv-siddharth";
const ACTIONS = `${REPO}/actions`;

const STATE_COLOR: Record<OpsState, string> = {
  OK: "var(--color-signal)",
  DEGRADED: "var(--color-accent)",
  BROKEN: "var(--color-danger)",
};

const RANK: Record<OpsState, number> = { BROKEN: 0, DEGRADED: 1, OK: 2 };

type RowModel = {
  key: string;
  state: OpsState;
  subject: string;
  subjectHref: string;
  detail: React.ReactNode;
  verified: string;
  verifiedHref?: string;
  /** Set only where an elapsed time is meaningful — drives the rail's clock. */
  sinceIso?: string;
  /** Which block this row belongs to, shown when it is hoisted into the rail. */
  lane?: string;
  /**
   * Set only on rows with a DECLARED deadline and a measured age against it —
   * the freshness perimeter and the published index. Everything else on this
   * board passes or fails and has no runway to spend, so it gets no mark on
   * the strip rather than a mark at zero, which would read as "just checked".
   */
  clock?: { age: number; sla: number };
};

const bySeverity = (a: RowModel, b: RowModel) => RANK[a.state] - RANK[b.state];

/** Whole days, rendered the way an operator reads them. */
function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(0, Math.floor(ms / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Time REMAINING, not elapsed.
 *
 * "21d / 45d" makes a reader do the subtraction. "24d left of 45d" is the same
 * fact already reduced to the part that matters, and it turns the perimeter
 * from trivia into a countdown — which is what it actually is.
 */
function budget(age: number, sla: number): string {
  const left = sla - age;
  if (left < 0) return `${-left}d OVER the ${sla}d SLA`;
  if (left === 0) return `due today · ${sla}d SLA`;
  return `${left}d left of ${sla}d`;
}

const bytes = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;

/** The LED. The only thing on the page allowed to move, and only when BROKEN. */
function Led({ state }: { state: OpsState }) {
  return (
    <span
      aria-hidden
      className={`ops-led inline-block h-2 w-2 shrink-0 rounded-full ${state === "BROKEN" ? "ops-pulse" : ""}`}
      style={{ background: STATE_COLOR[state] }}
    />
  );
}

/**
 * One row. Four fields, always.
 *
 * SUBJECT links to the thing and VERIFIED links to the evidence — the spec
 * makes connectivity mechanical, and ops.test.ts asserts both are present.
 */
function Row({ m, lane = false }: { m: RowModel; lane?: boolean }) {
  const external = m.subjectHref.startsWith("http");
  return (
    <div className="ops-row" data-state={m.state}>
      <Led state={m.state} />
      <div className="ops-cell">
        <a
          href={m.subjectHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {m.subject}
        </a>
        {lane && m.lane && <span className="ops-lane">{m.lane}</span>}
        <span className="ops-detail">{m.detail}</span>
      </div>
      <span className="ops-state" style={{ color: STATE_COLOR[m.state] }}>{m.state}</span>
      {m.verifiedHref ? (
        <a className="ops-verified" href={m.verifiedHref} target="_blank" rel="noreferrer">{m.verified}</a>
      ) : (
        <span className="ops-verified">{m.verified}</span>
      )}
    </div>
  );
}

/** A block heading is a rule line carrying its own census, not a card. */
function Block({ title, note, rows, figure, collapse }: {
  title: string;
  note: React.ReactNode;
  rows: RowModel[];
  /** A shape drawn from THIS block's own data, above its rows. Never a
   *  different dataset — and where it can only draw a subset of them (the
   *  tower has no failure rate to plot for a workflow that has never run), its
   *  figcaption says which rows are not in it. */
  figure?: React.ReactNode;
  /** The <summary> label, given only to blocks long enough to fold away. */
  collapse?: string;
}) {
  const id = `ops-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const n = (s: OpsState) => rows.filter((r) => r.state === s).length;
  /* A block may fold its rows away only when nothing in it is BROKEN, and the
     reason that is honest is stronger than "it is only one click": every
     non-OK row on this board is already hoisted into the rail above, verbatim
     and carrying its lane tag. A closed disclosure can therefore only ever be
     hiding rows that are simultaneously on screen up there. A board about
     failures nobody noticed cannot put one behind a closed disclosure, so the
     open state is derived from the rows themselves rather than passed in —
     ops.test.ts asserts both halves of that. */
  const holdsBroken = rows.some((r) => r.state === "BROKEN");
  const list = rows.length === 0
    ? <p className="ops-empty">— nothing reporting here yet</p>
    : rows.map((m) => <Row key={m.key} m={m} />);
  return (
    <section className="ops-block" aria-labelledby={id}>
      <div className="ops-rule">
        <h2 id={id} className="ops-rule__title">{title}</h2>
        <span className="ops-rule__census">
          <b style={{ color: STATE_COLOR.BROKEN }}>{n("BROKEN")}</b> broken ·{" "}
          <b style={{ color: STATE_COLOR.DEGRADED }}>{n("DEGRADED")}</b> degraded ·{" "}
          <b style={{ color: STATE_COLOR.OK }}>{n("OK")}</b> ok
        </span>
        <span className="ops-rule__note">{note}</span>
      </div>
      {figure}
      {collapse
        ? (
          <details className="ops-details" open={holdsBroken}>
            <summary className="ops-summary">{collapse}</summary>
            {list}
          </details>
        )
        : list}
    </section>
  );
}

/**
 * THE RUNWAY. One lane per thing this board watches on a clock, drawn as how
 * much of its OWN declared deadline it has already spent.
 *
 * Two decisions carry the whole visual.
 *
 * PER-LANE NORMALISATION, not a shared day count. A 21-day file and a 45-day
 * file two-thirds gone are equally worried, not equally old — the same reason
 * ChessArc gives each platform its own Y-scale rather than one that flatters
 * whichever series happens to run higher.
 *
 * THE LINE AT TWO-THIRDS. `stateForAge` turns a green check amber at
 * `age >= floor(sla * 2/3)`, and until now that rule lived only inside a
 * function no reader ever sees. Drawing it makes the page's central claim —
 * that DEGRADED is the interesting state — a thing you can point at.
 *
 * Each lane's LINE is computed from that same expression rather than parked at
 * a flat 66.6%: it happens to land there exactly for every SLA in use today
 * (14/21 and 30/45 are both exactly two-thirds), but an SLA not divisible by 3
 * would put it up to ~1.5% off, and a gridline that is the wrong line is worse
 * than no gridline on a board about things that quietly stopped being true.
 *
 * The LABEL above the lanes is a flat 66.6%, and cannot be anything else:
 * there is one scale strip over N lanes, so it can only sit where the rule
 * lands for all of them. Today it does. The day an SLA arrives that is not
 * divisible by 3, that label is the half of this figure that starts being
 * approximate — the lines under it stay exact.
 */
function Runway({ lanes, indexNote }: { lanes: RowModel[]; indexNote: boolean }) {
  return (
    <figure className="ops-figure ops-runway">
      {/* Not aria-hidden. These two labels are the only place the board names
          the boundary its whole argument rests on, and they read as a plain
          axis announcement ahead of the lane list. */}
      <div className="ops-runway__scale">
        <span className="ops-runway__scaleTrack">
          {/* Flat 66.6% because one strip covers every lane — see the note on
              this component. The per-lane lines below are the exact ones. */}
          <span className="ops-runway__gridlabel" style={{ left: "66.6%" }}>DEGRADED from here</span>
          <span className="ops-runway__gridlabel" style={{ left: "100%" }}>SLA</span>
        </span>
      </div>

      {/* Reserved for six lanes whether or not six arrive. Five render from
          committed data (the perimeter files); the published index only appears
          once /api/ops resolves, and /ops is already the site's worst CLS
          offender at 0.162 against a 0.25 error ceiling. A lane that pushes the
          whole board down when a fetch lands is a measurable regression, not a
          cosmetic one. */}
      <div className="ops-runway__lanes">
        {lanes.map((m) => {
          const { age, sla } = m.clock!;
          /* Clamped, not log-compressed. No lane in the committed data has
             ever been over its SLA; when one is, budget() states the overage
             in words ("Nd OVER the 45d SLA") and the bar sits at the wall.
             Machinery for a state that has never occurred is decoration. */
          const spent = Math.max(0, Math.min(1, age / sla));
          const degradedAt = Math.floor(sla * (2 / 3)) / sla;
          const external = m.subjectHref.startsWith("http");
          return (
            <a
              key={m.key}
              className="ops-runway__lane"
              href={m.subjectHref}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
            >
              <span className="ops-runway__name">{m.subject}</span>
              {/* The SVG is the position layer and nothing else. The lane name
                  and the budget string beside it are real HTML in DOM order,
                  so a screen reader and a sighted reader get the same list —
                  no role="img" carrying a twelve-clause label. */}
              <svg
                className="ops-runway__track"
                viewBox="0 0 1000 10"
                preserveAspectRatio="none"
                aria-hidden
                focusable="false"
              >
                <rect
                  x="0" y="0" width={degradedAt * 1000} height="10"
                  style={{ fill: "color-mix(in srgb, var(--color-signal) 6%, transparent)" }}
                />
                <rect
                  x={degradedAt * 1000} y="0" width={(1 - degradedAt) * 1000} height="10"
                  style={{ fill: "color-mix(in srgb, var(--color-accent) 6%, transparent)" }}
                />
                <rect x="0" y="0" width={spent * 1000} height="10" style={{ fill: STATE_COLOR[m.state] }} />
                <line
                  x1={degradedAt * 1000} y1="0" x2={degradedAt * 1000} y2="10"
                  /* --color-muted (6.09:1 on the ground), not --color-line
                     (1.40:1). --color-line is a border token and was never
                     checked for contrast as a data mark; on the one mark this
                     page calls "the exact rule that turns a green check
                     DEGRADED", it was legible only because the two 6% zone
                     washes either side of it differ in hue. */
                  stroke="var(--color-muted)"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="ops-runway__readout">{budget(age, sla)}</span>
            </a>
          );
        })}
      </div>

      <figcaption className="ops-figure__cap">
        Each mark is its own clock: how far across THAT LANE&rsquo;S OWN declared deadline it
        has aged — per-file where freshnessSla.ts names one, the blanket rule where it does
        not. A 21-day file and a 45-day file at the same mark are equally worried, not
        equally old.
        {lanes.length > 0 && lanes.every((m) => m.state === "OK") && (
          <> Nothing here is spending its runway faster than expected today.</>
        )}
        {indexNote && (
          <> F-Droid index omitted — the live index did not report a build time this load.</>
        )}
      </figcaption>
    </figure>
  );
}

type BarRow = { key: string; name: string; pct: number; value: React.ReactNode; color: string };

/**
 * Horizontal bars: name, track, value.
 *
 * The value is always text beside its bar and never the bar alone, so length
 * and colour are additive rather than the claim — the same rule the rows below
 * follow, and the reason none of these figures needs an aria-label reciting
 * numbers that are already in the DOM.
 */
function Bars({ rows, ceiling }: { rows: BarRow[]; ceiling?: React.ReactNode }) {
  return (
    <div className="ops-bars">
      {ceiling && (
        <div className="ops-bars__row ops-bars__row--scale">
          <span />
          <span className="ops-bars__ceiling">{ceiling}</span>
          <span />
        </div>
      )}
      {rows.map((r) => (
        <div className="ops-bars__row" key={r.key}>
          <span className="ops-bars__name">{r.name}</span>
          <span className="ops-bars__track">
            <span className="ops-bars__fill" style={{ width: `${r.pct * 100}%`, background: r.color }} />
          </span>
          <span className="ops-bars__value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The axis this figure is drawn on stops at 45, and it is a CONSTANT.
 *
 * An axis fitted to the tallest bar would silently stretch to absorb the exact
 * regression this block's comment is about: the generator once reported
 * shared.android.library at 63 against a true 24, and an auto-fitting chart
 * would have drawn that as a perfectly ordinary full-width bar. 45 is not a
 * design choice either — it is the literal bound ops.test.ts fails above, so
 * a bar that reaches this line is a bar whose build is already red.
 */
const LEVERAGE_CEILING = 45;

function LeverageFigure() {
  /* Sorted here, and the count read verbatim off `l.modules`. No maximum is
     derived anywhere in this figure — deriving one is what the guard exists to
     stop, and a chart is the easiest place to smuggle one back in. */
  const sorted = [...leverage].sort((a, b) => b.modules - a.modules);
  const zeros = sorted.filter((l) => l.modules === 0).length;
  return (
    <figure className="ops-figure">
      <Bars
        ceiling={`${LEVERAGE_CEILING} — a count this high means external/ is being walked again`}
        rows={sorted.map((l) => ({
          key: l.id,
          name: l.id,
          pct: l.modules / LEVERAGE_CEILING,
          color: l.modules > 0 ? STATE_COLOR.OK : STATE_COLOR.DEGRADED,
          value: l.modules > 0
            ? `${l.modules} module${l.modules === 1 ? "" : "s"}`
            /* Short, because there are ten of these and the long form wrapped
               to two lines in the 9.5rem value column — 340px of the figure,
               which is what made the desktop collapse cost more than the rows
               it replaced. The figcaption directly below explains the zeros in
               full and the collapsed row keeps the long sentence. */
            : "0 · applied by nothing",
        }))}
      />
      <figcaption className="ops-figure__cap">
        {zeros} of {sorted.length} sit at zero on purpose. A generator used to walk vendored
        copies and count them twice — it reported one plugin at 63 against a true 24, and
        painted all {zeros} of these zeros green. This is what that finding looks like once
        you can see it.
      </figcaption>
    </figure>
  );
}

/**
 * Play's install buckets, in MAGNITUDE order, written out.
 *
 * Not a sort. These are strings, and every string sort puts "1K+" before
 * "500+" and "10K+" before "5K+" — an axis running 1K, 10K, 100K, 1M, 5+, 50+,
 * 500+, 5K+ looks plausible enough at a glance to ship, which is the whole
 * problem with it.
 */
const INSTALL_BUCKETS = [
  "5+", "10+", "50+", "100+", "500+", "1K+",
  "5K+", "10K+", "50K+", "100K+", "500K+", "1M+",
] as const;

function FleetFigure() {
  const counts = new Map<string, number>(INSTALL_BUCKETS.map((b) => [b, 0]));
  for (const f of fleet) counts.set(f.installs, (counts.get(f.installs) ?? 0) + 1);
  /* Anything the next sweep invents lands at the end rather than being dropped
     on the floor by a lookup that does not know it. A histogram that silently
     loses a bucket is this board's own failure mode wearing a chart. */
  const order = [...counts.keys()];
  const top = Math.max(...counts.values());
  return (
    <figure className="ops-figure">
      <Bars
        rows={order.map((bucket) => {
          const n = counts.get(bucket)!;
          return {
            key: bucket,
            name: `${bucket} installs`,
            /* Log, because linear hands the largest bucket the whole track and
               leaves the single-app buckets at the top indistinguishable from
               the empty ones. */
            /* An empty bucket keeps its row and draws nothing, rather than
               disappearing: a bucket with nothing in it and a bucket that is
               missing read differently. All twelve are non-empty today, which
               is why this is a code comment and not a third of the caption. */
            pct: n === 0 ? 0 : Math.log10(1 + n) / Math.log10(1 + top),
            /* NOT a STATE_COLOR. This block's own note says there is no SLA on
               a row here — a quiet app is not a broken one — so painting the
               fleet in the three-state palette would invent a distinction the
               data does not have. */
            color: "var(--color-probe)",
            value: `${n} ${n === 1 ? "app" : "apps"}`,
          };
        })}
      />
      <figcaption className="ops-figure__cap">
        {fleetStats.live} listings, bucketed by Play&rsquo;s own install string, on a log
        scale. The rows below still show the fleet one app at a time.
      </figcaption>
    </figure>
  );
}

/**
 * Failure COUNTS, drawn as a share of each workflow's own recent runs — and
 * deliberately not coloured by state.
 *
 * `stateForRun` has no graduated threshold behind it, because nothing on this
 * board declares an acceptable failure rate. Drawing these in the three-state
 * palette would imply a "% failed = danger" rule that no constant anywhere
 * backs, on the one page whose argument is that a number should mean what it
 * says. When a MAX_RECENT_FAILURE_RATE lands in freshnessSla.ts with its own
 * test, the way SLA_DAYS already has, this earns a real runway lane. Until
 * then it is a count.
 */
function TowerFigure({ runs, neverRan }: { runs: OpsRun[]; neverRan: number }) {
  return (
    <figure className="ops-figure">
      {/* Height for five workflows, held whether or not the Actions API
          answers. These rows arrive after fetch on the route already measured
          at 0.162 CLS against a 0.25 error ceiling. */}
      <div className="ops-bars--tower">
        <Bars
          rows={runs.map((r) => ({
            key: r.workflow,
            name: r.workflow,
            pct: r.recentTotal > 0 ? r.recentFailures / r.recentTotal : 0,
            color: "var(--color-probe)",
            value: `${r.recentFailures} of last ${r.recentTotal}`,
          }))}
        />
      </div>
      <figcaption className="ops-figure__cap">
        How often each workflow&rsquo;s recent runs failed. This is a count, not a threshold:
        nothing on this board declares an acceptable failure rate, so nothing here turns
        amber at a number.
        {/* The reservation above holds its height whether or not the fetch
            lands, which means the no-runs state is a blank 102px box under a
            caption describing a chart. Runway says so via indexNote; this had
            nothing. */}
        {runs.length === 0 && <> No runs read this load — the Actions API did not answer.</>}
        {/* The block's census counts these; the figure cannot draw them. Said
            here rather than left to a reader who counts the bars and the rows
            and finds different numbers. */}
        {neverRan > 0 && (
          <>
            {" "}
            {neverRan} workflow{neverRan === 1 ? "" : "s"} with no completed run{" "}
            {neverRan === 1 ? "is" : "are"} in the rows below and not here: nothing to draw a rate from.
          </>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Time to resolution, as dots on a day axis.
 *
 * Eleven points is not a distribution, so there is no beeswarm and no jitter:
 * the seven incidents fixed on the day they were found are ONE dot carrying a
 * count, which is the honest rendering of n=11. Every incident here is closed,
 * so there is no state dimension to colour — only duration.
 */
function MttrFigure() {
  const closed = incidents.filter((i) => i.resolved);
  /* Nothing to plot on a duration axis if nothing has been resolved, and
     Math.max of an empty list is -Infinity. The axis itself survives that —
     `Math.max(30, worst)` below floors it at 30d — but `worst` is also read
     straight into the figcaption, which would say "the longest for -Infinity".
     The ledger's own floor is on incident COUNT (ops.test.ts: incidents.length
     >= 5), not on how many are closed, so this branch is reachable. */
  if (closed.length === 0) return null;
  const sameDay = closed.filter((i) => i.days === 0).length;
  const worst = Math.max(...closed.map((i) => i.days));
  /* Floored at 30 so a board of same-day fixes does not draw a two-day
     incident at the far wall of the axis and make it look like a disaster. */
  const axis = Math.max(30, worst);
  const groups = [...closed.reduce((m, i) => m.set(i.days, (m.get(i.days) ?? 0) + 1), new Map<number, number>())]
    .sort((a, b) => a[0] - b[0]);
  return (
    <figure className="ops-figure">
      <div className="ops-mttr">
        <div className="ops-mttr__track">
          {groups.map(([days, n]) => (
            <span key={days} className="ops-mttr__dot" style={{ left: `${(days / axis) * 100}%` }}>
              {n > 1 && <b>{n}</b>}
            </span>
          ))}
        </div>
        <div className="ops-mttr__axis">
          <span>0d</span>
          <span>{axis}d</span>
        </div>
      </div>
      <figcaption className="ops-figure__cap">
        {closed.length} failures a green check did not catch. {sameDay} were found and fixed
        the same day; {closed.length - sameDay} ran on, the longest for {worst}. A dot
        carrying a number is that many incidents at the same duration.
      </figcaption>
    </figure>
  );
}

/* NO DRIFT FIGURE, and this is the note saying why rather than an omission.
   Eight pins carry two distinct values today (behind ∈ {2, 4}), so the bars
   rendered as four half-width and four FULL-width, alternating. A full-width
   bar in a dashboard reads "at the limit", and there is no limit here to be at
   — normalising against the furthest-behind pin was honest and the caption
   said so, but a caption loses to a bar. It also cost more than it saved: 204px
   of figure to collapse 53px of rows. The rows already say "2 commits behind"
   in words, which at two distinct values is the whole of the finding.
   ponytail: revisit only if the spread ever needs a shape to be read at all. */

/**
 * The one ticking readout on the page, and the only thing that says "right
 * now" rather than "as of".
 *
 * Its own component so the 1Hz setState re-renders ONE span instead of
 * reconciling every row on the board every second. Mounted only when a BROKEN
 * row exists, and it does not start under prefers-reduced-motion — with a
 * change listener, so toggling the OS setting mid-session actually stops it.
 */
function BrokenClock({ sinceIso }: { sinceIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let id = 0;
    const sync = () => {
      window.clearInterval(id);
      id = mq.matches ? 0 : window.setInterval(() => setNow(Date.now()), 1000);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => { window.clearInterval(id); mq.removeEventListener("change", sync); };
  }, []);
  const ms = Math.max(0, now - Date.parse(sinceIso));
  const d = Math.floor(ms / 86_400_000);
  const t = new Date(ms % 86_400_000).toISOString().slice(11, 19);
  return <span className="ops-clock">worst unchanged for {d}d {t}</span>;
}

/** A workflow's conclusion, mapped onto the board's three states. */
function stateForRun(r: OpsRun): OpsState {
  if (r.conclusion === "success") return r.recentFailures > 0 ? "DEGRADED" : "OK";
  if (r.conclusion === "skipped") return "DEGRADED";
  return "BROKEN";
}

/** The web builds this domain serves — derived, so a new one appears here. */
const LIVE_BUILDS = projects.flatMap((p) => {
  const t = p.targets?.find((x) => x.liveUrl);
  return t?.liveUrl ? [{ slug: p.slug, name: p.name.split(/\s*[—–:]\s+/)[0], url: t.liveUrl }] : [];
});

export function OpsBoard() {
  const [ops, setOps] = useState<Ops | null>(null);
  const [failed, setFailed] = useState(false);
  /** slug → HTTP status of its embed, checked same-origin in the browser. */
  const [builds, setBuilds] = useState<Record<string, number | "err">>({});

  useEffect(() => {
    let live = true;
    fetch("/api/ops")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Ops) => live && setOps(d))
      .catch(() => live && setFailed(true));

    // The one check on this page a reader's own browser performs. Every live
    // build is same-origin, so it costs no API and cannot be faked by the
    // server: if an embed 404s, the row claiming it is playable goes red.
    for (const b of LIVE_BUILDS) {
      fetch(b.url, { method: "HEAD" })
        .then((r) => live && setBuilds((s) => ({ ...s, [b.slug]: r.status })))
        .catch(() => live && setBuilds((s) => ({ ...s, [b.slug]: "err" })));
    }
    return () => { live = false; };
  }, []);

  /* Stamped once at mount, to the second. It is literally true — it IS the
     instant every age on this page was computed — and it costs zero motion. */
  const loadedAt = useMemo(() => new Date().toISOString().slice(0, 19) + "Z", []);

  const towerRows = useMemo<RowModel[]>(() => [
    ...(ops?.runs ?? []).map((r): RowModel => ({
      key: `tower:${r.workflow}`,
      lane: "tower",
      state: stateForRun(r),
      subject: r.workflow,
      subjectHref: ACTIONS,
      detail: `${r.event} · ${r.recentFailures} of the last ${r.recentTotal} runs failed`,
      verified: ago(r.at),
      verifiedHref: r.url,
      sinceIso: r.at,
    })),
    ...(ops?.neverRan ?? []).map((w): RowModel => ({
      key: `tower:${w}`,
      lane: "tower",
      state: "DEGRADED",
      subject: w,
      subjectHref: ACTIONS,
      detail: "no completed run on record",
      verified: "never",
    })),
  ].sort(bySeverity), [ops]);

  /**
   * What is published, signed by whom, and how a reader checks it themselves.
   *
   * The one chain on this site that is cryptographically verifiable end to
   * end, and it was missing from the board entirely.
   */
  const chainRows = useMemo<RowModel[]>(() => {
    const chain = ops?.supplyChain;
    if (!chain?.connected) return [];
    const rows: RowModel[] = chain.apps.map((a): RowModel => ({
      key: `chain:${a.pkg}`,
      lane: "published",
      state: a.signerMatches ? "OK" : "BROKEN",
      subject: a.pkg,
      subjectHref: a.fdroidUrl,
      detail: (
        <>
          v{a.versionName} ({a.versionCode}) · {bytes(a.sizeBytes)} ·{" "}
          {a.signerMatches ? "signed with the pinned key" : "SIGNED WITH AN UNEXPECTED KEY"}
          {a.antiFeatures.length > 0 && ` · ${a.antiFeatures.join(", ")}`}
        </>
      ),
      verified: "release",
      verifiedHref: a.releaseUrl,
    }));
    if (chain.indexBuiltAt) {
      const age = ageDays(chain.indexBuiltAt.slice(0, 10));
      /* MAX_AGE_DAYS, not a literal 45. The index is not a file in src/data, so
         it is not in SLA_DAYS and has no per-file deadline of its own — it
         falls back to the same blanket rule everything unnamed does. That was
         a bare `45` in four places here, which was survivable while it only
         fed stateForAge and stopped being survivable when the runway drew it
         as a gridline captioned "declared SLA". It is declared, in
         freshnessSla.ts, and now says so. */
      rows.push({
        key: "chain:index",
        lane: "published",
        state: stateForAge(age, MAX_AGE_DAYS),
        subject: "F-Droid index",
        subjectHref: "https://darkpandawarrior.github.io/fdroid/repo/",
        detail: `signed by a different key from the APKs, so compromising this site cannot forge an app update · ${budget(age, MAX_AGE_DAYS)}`,
        verified: chain.indexBuiltAt.slice(0, 10),
        verifiedHref: "https://darkpandawarrior.github.io/fdroid/",
        sinceIso: chain.indexBuiltAt,
        clock: { age, sla: MAX_AGE_DAYS },
      });
    }
    return rows.sort(bySeverity);
  }, [ops]);

  /** The perimeter, aged at render time so the board is never staler than the
   *  moment it loaded — even if nothing has rebuilt for a week. */
  const perimeterRows = useMemo<RowModel[]>(() => {
    const rows = perimeter.map((p): RowModel => {
      const age = ageDays(p.generatedAt);
      return {
        key: `perimeter:${p.file}`,
        lane: "perimeter",
        state: stateForAge(age, p.slaDays),
        subject: p.file,
        subjectHref: `${REPO}/blob/main/src/data/${p.file}`,
        detail: `${budget(age, p.slaDays)} · ${p.generator.replace("npm run ", "")}`,
        verified: p.generatedAt,
        verifiedHref: `${REPO}/actions/workflows/refresh-media.yml`,
        sinceIso: p.generatedAt,
        clock: { age, sla: p.slaDays },
      };
    });
    const sweepAge = ageDays(storeGeneratedAt);
    /* NO `clock`, deliberately — this row is not a runway lane.
       `storeGeneratedAt` IS store.ts's stamp, and store.ts is already in
       `perimeter` above with the same date and the same 45-day SLA. Given a
       clock, the runway drew the two as separate lanes with pixel-identical
       bars ("20d left of 45d", twice), under a figcaption promising one lane
       per thing this board watches on a clock. The row stays: the sweep is a
       different FACT about the same file — that nothing runs it on a cron —
       and that belongs in the perimeter block. It just is not a second
       deadline. */
    rows.push({
      key: "perimeter:sweep",
      lane: "perimeter",
      state: stateForAge(sweepAge, MAX_AGE_DAYS),
      subject: "Play Store fleet sweep",
      subjectHref: `${REPO}/blob/main/scripts/gen-store.mjs`,
      detail: `${budget(sweepAge, MAX_AGE_DAYS)} · gen:store · run by hand, not on a cron`,
      verified: storeGeneratedAt,
      sinceIso: storeGeneratedAt,
    });
    return rows.sort(bySeverity);
  }, []);

  /** The five web builds this domain serves, checked by your own browser. */
  const buildRows = useMemo<RowModel[]>(
    () => LIVE_BUILDS.map((b): RowModel => {
      const status = builds[b.slug];
      const state: OpsState = status === undefined ? "DEGRADED" : status === 200 ? "OK" : "BROKEN";
      return {
        key: `build:${b.slug}`,
        lane: "surfaces",
        state,
        subject: b.name,
        subjectHref: b.url,
        detail:
          status === undefined ? `${b.url} · checking…`
          : status === 200 ? `${b.url} · served from this domain`
          : `${b.url} · ${status === "err" ? "unreachable" : `HTTP ${status}`}`,
        verified: status === undefined ? "…" : status === 200 ? "just now" : "failed",
      };
    }).sort(bySeverity),
    [builds],
  );

  /**
   * How far each app is behind the shared foundation it vendors.
   *
   * Real SHA distance: every consumer pins kmp-toolkit and kmp-build-logic as
   * git submodules, so "behind" is `rev-list --count <pin>..HEAD`. A pin the
   * clone has never fetched reports as unmeasured rather than as zero.
   */
  const driftRows = useMemo<RowModel[]>(
    () => drift.map((d): RowModel => ({
      key: `drift:${d.repo}:${d.upstream}`,
      lane: "drift",
      // No BROKEN here, and deliberately no threshold. "8 commits behind" as a
      // failure line would be a number invented to make a row red — the exact
      // thing this board refuses elsewhere. Drift has no declared SLA, so it
      // reports two honest states: level, or behind by a measured amount.
      state: d.behind === 0 ? "OK" : "DEGRADED",
      subject: `${d.repo} → ${d.upstream}`,
      subjectHref: `https://github.com/darkpandawarrior/${d.upstream}`,
      detail: d.behind === null
        ? `pinned at ${d.pin}, a commit this clone has never fetched — distance unmeasured rather than assumed zero`
        : d.behind === 0
          ? `pinned at ${d.pin} · level with upstream`
          : `pinned at ${d.pin} · ${d.behind} commit${d.behind === 1 ? "" : "s"} behind upstream`,
      verified: d.pinnedAt ?? "unknown",
    })).sort(bySeverity),
    [],
  );

  /* All of them, oldest release first. Eight rows with a dot is a status
     badge; the whole fleet is somebody noticing what nobody else did.

     STATE is "confirmed listed on the last sweep", never "shipped recently".
     gen-store.mjs drops anything whose listing does not resolve, so every row
     present IS live. An app quiet since 2023 is a quiet app, not a broken one,
     and the staleness that CAN go wrong here — the sweep's — has its own row
     on the perimeter above. */
  const fleetRows = useMemo<RowModel[]>(
    () => [...fleet]
      .filter((f) => f.updated)
      .sort((a, b) => Date.parse(a.updated!) - Date.parse(b.updated!))
      .map((f): RowModel => ({
        key: `fleet:${f.id}`,
        lane: "fleet",
        state: "OK",
        subject: f.name,
        subjectHref: f.url,
        detail: (
          <>
            {f.developer} · {f.installs} installs · last shipped{" "}
            <span className="ops-atom">{new Date(f.updated!).toISOString().slice(0, 10)}</span>
          </>
        ),
        verified: storeGeneratedAt,
        verifiedHref: f.url,
      })),
    [],
  );

  /**
   * Convention plugins by the modules that apply them.
   *
   * A plugin applied by nothing is DEGRADED, and ten of the seventeen are.
   * That is a real finding about his own toolchain rather than a rendering
   * accident: the generator used to walk each consumer's vendored `external/`
   * submodules, which counted upstream modules once per consumer and counted
   * every plugin's own declaration file as a consumer of itself. It reported
   * shared.android.library at 63 against a true 24, and painted all ten of the
   * zeros green.
   */
  const leverageRows = useMemo<RowModel[]>(
    () => leverage.map((l): RowModel => ({
      key: `leverage:${l.id}`,
      lane: "leverage",
      state: l.modules > 0 ? "OK" : "DEGRADED",
      subject: l.id,
      subjectHref: "https://github.com/darkpandawarrior/kmp-build-logic",
      detail: l.modules > 0
        ? l.repos.join(" · ")
        : "authored, applied by no consumer module — the id appears in no build file outside its own declaration",
      verified: `${l.modules} modules`,
    })).sort(bySeverity),
    [],
  );

  const ledgerRows = useMemo<RowModel[]>(
    () => incidents.map((i): RowModel => ({
      key: `ledger:${i.id}`,
      lane: "ledger",
      state: i.resolved ? "OK" : "BROKEN",
      subject: i.subject,
      subjectHref: i.subjectHref,
      detail: i.what,
      verified: i.resolved ? `${i.days}d to fix` : "open",
      verifiedHref: i.evidenceHref,
    })).sort(bySeverity),
    [],
  );

  const all = [
    ...towerRows, ...chainRows, ...perimeterRows, ...buildRows,
    ...driftRows, ...fleetRows, ...leverageRows, ...ledgerRows,
  ];
  const escalated = [...all].filter((m) => m.state !== "OK").sort(bySeverity);
  const brokenCount = escalated.filter((m) => m.state === "BROKEN").length;
  const worst = escalated[0];
  const worstState: OpsState = worst?.state ?? "OK";

  const loop = [
    ["DETECT", all.length, false],
    ["ANNOUNCE", escalated.length, escalated.length > 0],
    ["ESCALATE", brokenCount, brokenCount > 0],
    ["REPAIR", incidents.filter((i) => !i.resolved).length, false],
    ["RECORD", incidents.length, false],
  ] as const;

  const closed = incidents.filter((i) => i.resolved);
  const guarded = closed.filter((i) => i.evidenceHref.includes(".test.")).length;

  const degradedCount = escalated.length - brokenCount;
  const steadyCount = all.length - escalated.length;

  /**
   * The verdict, in one sentence, above everything else in the banner.
   *
   * The counters below it say how many; this says whether. Note what the
   * DEGRADED wording does NOT claim: not that those rows are clocks running
   * down. Most of them are not — today the rail is ten plugins nothing applies
   * and eight submodule pins, neither of which has a deadline at all. Writing
   * "N clocks are past two-thirds spent" here would be a sentence the data
   * does not support, on the one page whose argument is that a claim has to
   * stay true. The composition line in the rail says what the N is made of.
   */
  const verdict =
    worstState === "BROKEN"
      ? `${brokenCount} broken, ${degradedCount} more not right — the worst has been wrong for the duration below.`
      : worstState === "DEGRADED"
        ? `${escalated.length} of ${all.length} things are passing and still not right. Nothing is broken and nothing is past a deadline; what that ${escalated.length} is made of is on the rail below.`
        : `Nothing here has crossed its own line — ${all.length} things checked, and not one of them is degraded or broken.`;

  /* What the rail is ACTUALLY made of, by the lane every row already carries.
     Without this line eighteen escalated rows read as eighteen alarms. With
     it they read as two known structural conditions and nothing acute, which
     is the truth — and alarm fatigue is the failure this page argues against,
     so the board should not manufacture it about itself. */
  const railLanes = Object.entries(
    escalated.reduce<Record<string, number>>((acc, m) => {
      const lane = m.lane ?? "unlabelled";
      acc[lane] = (acc[lane] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  /* Severity rank is the one axis all ~145 rows genuinely share — a fleet row
     and a workflow row have nothing else in common — so it is the one thing a
     single bar across the whole board can honestly encode. Three segments, in
     STATE_COLOR order, and the counts are the text under it. */
  const census: readonly (readonly [OpsState, number])[] = [
    ["BROKEN", brokenCount],
    ["DEGRADED", degradedCount],
    ["OK", steadyCount],
  ];

  /* The runway's lanes are the SAME RowModels the perimeter and chain blocks
     render — filtered on carrying a clock, never recomputed, so a strip and
     the rows beneath it cannot drift apart the way the board's own SLA table
     once drifted from the test that enforced it. */
  const runwayLanes = [...perimeterRows, ...chainRows].filter((m) => m.clock).sort(bySeverity);
  /* The published index is drawn only when the live feed actually reports a
     build time. Drawing it at zero when the feed is unreachable would read as
     "just refreshed", which is the single most expensive lie this page could
     tell about itself. Silent until the fetch settles, then it says so. */
  const indexNote = (ops !== null || failed) && !runwayLanes.some((m) => m.key === "chain:index");

  return (
    <>
      {/* The skip link in __root.tsx targets #main-content, and every other
          route provides it. Without it "Skip to content" lands nowhere, which
          is both a real keyboard trap and what made e2e/a11y.spec.ts time out
          here rather than report a violation. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[92rem] px-6 py-10">
        {/* A way out. A route a visitor can land on and only leave with the
            back button is the failure surfaces.test.ts calls the loopdown bug,
            and it would be a poor joke on a page about noticing things. */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link to="/" className="kicker-accent transition hover:opacity-80">← Back to portfolio</Link>
          <LauncherButton />
        </div>
        <p className="section-eyebrow mb-2">// the control loop</p>
        <h1 className="font-display mb-3 text-h2 font-bold tracking-tight">Still true, or only once true</h1>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Every other page here argues the work was good. This one argues it is still true, and shows
          the machinery that would notice if it stopped being. Three states:{" "}
          <b style={{ color: STATE_COLOR.OK }}>OK</b> is a check that ran and passed,{" "}
          <b style={{ color: STATE_COLOR.BROKEN }}>BROKEN</b> is a check that failed or an SLA that is
          blown, and <b style={{ color: STATE_COLOR.DEGRADED }}>DEGRADED</b> —{" "}
          <i>passing, succeeding daily, and quietly aging toward its deadline</i> — is the state every
          failure this board was built after actually lived in. The runway below is where you can watch it
          happening.
        </p>

        <div className="ops-console font-mono-os">
          <div className="ops-banner" data-worst={worstState}>
            <div className="ops-banner__line">
              <span className="ops-banner__mark">SID//OS</span>
              <span className="ops-banner__name">ops console</span>
              <a className="ops-banner__link" href={REPO} target="_blank" rel="noreferrer">darkpandawarrior/cv-siddharth</a>
              <span>aged at load {loadedAt}</span>
              <span>actions api {failed ? "unreachable" : ops ? "connected" : "reading…"}</span>
            </div>

            {/* The verdict. Largest type in the banner and the only sentence
                allowed to be a sentence, because "18" is a number a reader has
                to interpret and "nothing is broken" is not. It sits ABOVE the
                counters and above the rail: the counters are its receipts. */}
            <p className="ops-verdict" data-worst={worstState}>{verdict}</p>

            <div className="ops-banner__line">
              {loop.map(([label, n, hot]) => (
                <span key={label} className="ops-stat" data-hot={hot}>
                  {label}<b>{String(n).padStart(3, "0")}</b>
                </span>
              ))}
            </div>

            {/* THE RAIL. The actual non-OK rows, so the worst thing in the
                system is on screen at every scroll position. They stay in
                their own blocks below and the census there still counts them. */}
            <section className="ops-rail" aria-labelledby="ops-rail-h">
              <div className="ops-banner__line">
                <h2 id="ops-rail-h" className="ops-rail__badge">
                  {escalated.length ? "escalated" : "all clear"}
                </h2>
                <span><b>{brokenCount}</b> broken</span>
                <span><b>{escalated.length - brokenCount}</b> degraded</span>
                <span><b>{all.length - escalated.length}</b> steady</span>
                <span>
                  {escalated.length
                    ? "pinned here and still counted in their own blocks below"
                    : "nothing is escalating; every row is inside the SLA it declares"}
                </span>
                {escalated.length > 0 && (
                  <span>
                    {escalated.length} escalated —{" "}
                    {railLanes.map(([lane, n]) => `${n} ${lane}`).join(" · ")}
                  </span>
                )}
                {worstState === "BROKEN" && worst?.sinceIso && <BrokenClock sinceIso={worst.sinceIso} />}
              </div>
              {escalated.length > 0 && (
                <div className="ops-rail__list">
                  {escalated.map((m) => <Row key={`esc:${m.key}`} m={m} lane />)}
                </div>
              )}
            </section>
          </div>

          {/* Sibling h2 of the rail's and of every block's, so heading order
              stays a flat h1 → h2* list. No h3 anywhere on this page. */}
          <section className="ops-runwaySection" aria-labelledby="ops-runway-h">
            <div className="ops-rule">
              <h2 id="ops-runway-h" className="ops-rule__title">The runway</h2>
              <span className="ops-rule__note">
                everything this board watches on a clock rather than on a pass or a fail · the
                line at two-thirds is not decoration, it is the exact rule that turns a green
                check DEGRADED
              </span>
            </div>
            <Runway lanes={runwayLanes} indexNote={indexNote} />
          </section>

          <figure className="ops-figure ops-figure--wide">
            {/* Decorative: every number in it is spelled out in the caption
                directly below, in the same order, so a screen reader loses
                nothing by skipping the bar. */}
            <div className="ops-census" aria-hidden>
              {census.map(([state, n]) => (
                <span
                  key={state}
                  className="ops-census__seg"
                  style={{
                    width: `${(n / Math.max(1, all.length)) * 100}%`,
                    /* One broken row in 145 is 0.7% of the width, which at
                       most viewports rounds to nothing, so a nonzero segment
                       gets a 3px floor. Same INTENT as Pulse.tsx's Bar, not
                       the same number: that one floors at 3 PERCENT of its own
                       track, which is the right unit for a bar whose track is
                       always full width and the wrong one here, where each
                       segment's width is its share. */
                    minWidth: n > 0 ? 3 : 0,
                    background: STATE_COLOR[state],
                  }}
                />
              ))}
            </div>
            <figcaption className="ops-figure__cap">
              <b>{brokenCount}</b> broken · <b>{degradedCount}</b> degraded ·{" "}
              <b>{steadyCount}</b> steady, across {all.length} rows. Nothing here is a
              measurement — it is a headcount, and severity rank is the only axis all these
              rows honestly share.
            </figcaption>
          </figure>

          <Block
            title="Control tower"
            note="every workflow in the repo that ships this site, read live from the Actions API"
            figure={<TowerFigure runs={ops?.runs ?? []} neverRan={ops?.neverRan?.length ?? 0} />}
            rows={towerRows}
          />
          <Block
            title="Published and signed"
            note="what is on the F-Droid repo right now, and the two keys that put it there — run apksigner verify --print-certs on any download and compare"
            rows={chainRows}
          />
          <Block
            title="Freshness perimeter"
            note="generated data against the SLA its own test enforces · worst first · aged as you loaded this page"
            rows={perimeterRows}
          />
          <Block
            title="Live surfaces"
            note="the web builds this domain serves — checked by your own browser, same-origin, when this page loaded"
            rows={buildRows}
          />
          <Block
            title="Vendored drift"
            note="how far each app is behind the shared foundation it pins as a git submodule"
            rows={driftRows}
            collapse={`See all ${driftRows.length} pins`}
          />
          <Block
            title="Fleet heartbeat"
            note={
              <>
                {fleetStats.live} apps re-verified against their live Play listings on the last
                sweep · {fleetStats.installFloor.toLocaleString()} installs floor ·{" "}
                {fleetStats.delisted} since delisted. No SLA on a row here: a quiet app is not a
                broken one, and the sweep has its own perimeter row. These shipped from employer
                work — the listings are public and anyone can re-check them, the source was never
                his and is not tracked on this board.
              </>
            }
            rows={fleetRows}
            figure={<FleetFigure />}
            collapse={`See all ${fleetRows.length}, oldest release first`}
          />
          <Block
            title="Leverage"
            note="convention plugins by the modules that apply them — a plugin nothing applies is DEGRADED, not absent"
            rows={leverageRows}
            figure={<LeverageFigure />}
            collapse={`See all ${leverageRows.length}, applied first`}
          />
          <Block
            title="Incident ledger"
            note="every failure a green check did not catch · each entry is about a row above it"
            rows={ledgerRows}
            figure={<MttrFigure />}
            collapse={`See all ${ledgerRows.length} incidents`}
          />

          <p className="ops-empty">
            {guarded} of {closed.length} closed by a check that now sits on this board — which is the
            loop shut.
          </p>
        </div>

        <p className="kicker mt-6">
          Perimeter, leverage and drift generated {opsGeneratedAt} from repos on the build machine;
          ages computed as you loaded this page; the control tower, the published chain and the live
          surfaces all read at load. Employment-era figures are measured history, not a live feed.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
