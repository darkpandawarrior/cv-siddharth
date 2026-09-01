import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePageData, usePlayContext } from "@playhtml/react";
import { Link } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import {
  EMPTY_LEDGER,
  isoDay,
  myZone,
  ordinal,
  pickShard,
  planVisit,
  readVisitor,
  recentDays,
  sumDays,
  topZones,
  totalVisitors,
  withOrdinal,
  writeVisitor,
  type DayTally,
  type VisitorLedger,
  type VisitorRecord,
} from "./visitors.ts";

/**
 * The door counter — who has been through, when, and which one you are.
 *
 * The rest of the shared layer counts what people *do*; this counts that they
 * came at all, and hands each visitor their own number on the way in. That is
 * the whole feature: an arrival is the one interaction every single visitor
 * has with this site, and it was the one thing nothing here was noticing.
 *
 * Rules live in visitors.ts, which imports nothing — playhtml touches
 * `document` at module load, so the arithmetic and the input handling stay in
 * a file the test runner can load under plain node. Same split the guest wall
 * uses, for the same reason.
 */

/* Shape change here is a shape change to a live document, so this name is
 * effectively a schema version. Bump it and the room starts from zero. */
const CHANNEL = "visitors-v1";

const PLAQUE_SPAN = 30;
const COUNT_UP_MS = 1100;

/**
 * How long to wait for the room's contents before accepting that it is empty.
 *
 * `isLoading` going false means playhtml finished connecting, not that this
 * replica has received the document — the first render after connecting can
 * still show an empty ledger that is about to be filled in. Counting there is
 * harmless for the total (the shard increment merges either way) but ruins the
 * number handed to the visitor: they get told they are the 2nd person through
 * a door that four hundred people have used.
 *
 * So the arrival waits for the room to actually show up. An empty room is a
 * real state though — somebody has to be first — so the wait is bounded, and
 * running out simply means the room really is empty.
 */
const SYNC_GRACE_MS = 2_000;

/** A fresh object per call: the default is written into the shared document on
 *  first use, and handing a module-level constant to something that will proxy
 *  and mutate it is how a shared constant quietly becomes shared state. */
const freshLedger = (): VisitorLedger => ({ shards: {}, days: {}, zones: {} });

/** What this browser is, once it's known: its record, and whether *this page
 *  load* is the one that counted it — which is what earns the animation. */
interface MyVisit {
  record: VisitorRecord;
  fresh: boolean;
}

/** What the page knows about this browser, and whether it has finished finding
 *  out. `settled` is the difference between "not counted" and "not counted
 *  *yet*" — without it the plaque reads the empty state out loud for a second
 *  and then corrects itself, which is worse than staying quiet. */
interface VisitState {
  visit: MyVisit | null;
  settled: boolean;
}

const VisitContext = createContext<VisitState>({ visit: null, settled: false });

/* One page load, one arrival — held at module scope rather than in component
 * state because the provider can remount underneath us: a client-side route
 * change back into a room, StrictMode's double mount in development, an HMR
 * update. React rebuilding the tree must not replay the arrival, and must not
 * lose the fact that *this* load is the one that counted you — a remount that
 * re-read localStorage would find the freshly written record and quietly
 * demote a brand-new visitor to a returning one, which is how the ceremony
 * went missing the first time this was wired up. A real page load resets it. */
let arrival: MyVisit | null = null;
let arrivalSettled = false;

/** This browser's own place in the count, and whether the answer is final. */
export function useMyVisit(): VisitState {
  return useContext(VisitContext);
}

/** The shared ledger. Empty until the socket syncs, and empty forever if it
 *  never does, so every reader degrades to "say nothing" on its own. */
export function useVisitorLedger(): VisitorLedger {
  const [ledger] = usePageData<VisitorLedger>(CHANNEL, freshLedger());
  return ledger ?? EMPTY_LEDGER;
}

/**
 * Wraps the rooms so arriving anywhere in the shared layer counts the same
 * way, and so the plaque can render this browser's own record instantly on a
 * return visit — that comes out of localStorage, not off the wire.
 */
export function VisitorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VisitState>(() => {
    if (arrivalSettled) return { visit: arrival, settled: true };
    // A returning visitor's own record is here before the socket is, so their
    // number is on screen immediately and never has to appear to change.
    const record = typeof localStorage === "undefined" ? null : readVisitor(localStorage);
    return { visit: record ? { record, fresh: false } : null, settled: false };
  });
  // Stable so the counter's effect doesn't re-run on every parent render.
  const settle = useCallback((visit: MyVisit | null) => setState({ visit, settled: true }), []);
  return (
    <VisitContext.Provider value={state}>
      {/* Isolated on purpose: this is the only thing subscribed to the ledger
          up here, so a visitor arriving re-renders one null component instead
          of every room under the provider. */}
      <VisitCounter onSettled={settle} />
      {children}
    </VisitContext.Provider>
  );
}

function VisitCounter({ onSettled }: { onSettled: (visit: MyVisit | null) => void }) {
  const [ledger, setLedger] = usePageData<VisitorLedger>(CHANNEL, freshLedger());
  const { isLoading } = usePlayContext();
  const [grace, setGrace] = useState(false);

  // Starts the clock on "is this room actually empty, or just not here yet".
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => setGrace(true), SYNC_GRACE_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    // Before sync the setter is a no-op, so acting early would spend this
    // browser's one arrival on a write that goes nowhere.
    if (isLoading || arrivalSettled) return;
    // Either the room has arrived, or it has had long enough to. This effect
    // re-runs on every ledger change, so the moment it lands we proceed.
    if (totalVisitors(ledger) === 0 && !grace) return;
    arrivalSettled = true;

    const today = isoDay(new Date());
    const plan = planVisit(readVisitor(localStorage), today);

    if (!plan.countPerson && !plan.countDay) {
      arrival = { record: plan.record, fresh: false };
      onSettled(arrival);
      return;
    }
    // Claim first. A browser that cannot remember being counted must not be
    // counted at all, or every page load it makes is a new person. The record
    // goes in unnumbered and is settled below, once the write can say what the
    // number is — if that second write is the one that fails, this visitor is
    // still counted exactly once, just without a number to show for it.
    if (!writeVisitor(localStorage, plan.record)) {
      // Counted nobody. Still settled: the plaque can stop waiting and talk
      // about the room instead of about you.
      onSettled(null);
      return;
    }

    const shard = pickShard();
    const zone = myZone();
    let counted = 0;
    setLedger((draft) => {
      /* Every write below is in place, one key at a time, and that is load
       * bearing: the draft is a syncedstore proxy over the Yjs document, so
       * `draft.shards[shard] = n` is a single-key operation that merges with
       * everyone else's, while `draft.shards = {...}` would replace the whole
       * map and drop concurrent writers — the exact lost update the shards
       * exist to prevent. Never reassign a container here. */
      draft.shards ??= {};
      draft.days ??= {};
      draft.zones ??= {};
      if (plan.countPerson) {
        draft.shards[shard] = (draft.shards[shard] ?? 0) + 1;
        if (zone) draft.zones[zone] = (draft.zones[zone] ?? 0) + 1;
        // Read back inside the transaction: this is the live document, not the
        // render-time snapshot, so it is the only place the true count — with
        // this visitor's own increment already in it — can be had.
        counted = totalVisitors(draft);
      }
      if (plan.countDay) draft.days[today] = (draft.days[today] ?? 0) + 1;
    });

    const record = plan.countPerson ? withOrdinal(plan.record, counted) : plan.record;
    if (plan.countPerson) writeVisitor(localStorage, record);
    arrival = { record, fresh: plan.countPerson };
    onSettled(arrival);
  }, [isLoading, grace, ledger, setLedger, onSettled]);

  return null;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Runs the number up to its value once, for the one visit that earned it.
 *  Everyone else — and anyone who asked for less motion — gets it straight.
 *
 *  Exported for /pulse's headline. Note the effect re-runs on every `target`
 *  change and restarts from zero: correct for a number that is fixed once
 *  known, wrong for one that ticks, so a live caller has to drop `run` after
 *  the first pass rather than leave it armed. */
export function useCountUp(target: number, run: boolean): number {
  const [shown, setShown] = useState(() => (run ? 0 : target));
  useEffect(() => {
    if (!run || target <= 0 || prefersReducedMotion()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / COUNT_UP_MS);
      // easeOutExpo, the curve --ease-out-expo uses everywhere else here.
      setShown(Math.round(target * (t === 1 ? 1 : 1 - 2 ** (-10 * t))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return shown;
}

/** `liveEdge` glows today's bar, and only today's. Off by default so the
 *  plaque's call site renders exactly as it did — the glow belongs to /pulse,
 *  where the whole page is an argument that this thing is running right now. */
export function DayBars({
  days,
  className = "",
  liveEdge = false,
}: {
  days: DayTally[];
  className?: string;
  liveEdge?: boolean;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const last = days[days.length - 1];
  const today = last?.day;
  return (
    <div
      className={`flex items-end gap-[2px] ${className}`}
      role="img"
      /* The "N today" clause is the live edge's accessible half, so it is on the
         same flag the glow is. The plaque on /playground shares this component
         and its aria-label was byte-identical before liveEdge existed — the
         prop exists precisely to keep it that way. */
      aria-label={
        `Visits per day over the last ${days.length} days — ${sumDays(days)} in total` +
        (liveEdge ? `, ${last?.count ?? 0} today` : "")
      }
    >
      {days.map((d) => {
        // How strongly the day is drawn — its count against the busiest day.
        const alpha = d.count ? 0.35 + 0.65 * (d.count / max) : 0.16;
        const glowing = liveEdge && d.day === today;
        return (
          <span
            key={d.day}
            aria-hidden="true"
            title={`${d.day} — ${d.count} visit${d.count === 1 ? "" : "s"}`}
            className={`min-w-0 flex-1 rounded-[1px] transition-[height] duration-700 ${glowing ? "pulse-edge" : ""}`}
            style={{
              // Empty days keep a hairline so the axis stays readable — a gap
              // and a quiet day should not look like the same thing.
              height: d.count ? `${Math.max(12, (d.count / max) * 100)}%` : "6%",
              /* The glowing bar carries its alpha IN THE FILL and stays at
                 opacity 1; every other bar dims with the `opacity` property.
                 Same encoding, different property, because `opacity`
                 composites the whole element — box-shadow and outline
                 included. The glow is how today's bar is picked out of sixty,
                 and on a quiet day (42 of the last 60 on production had no
                 visits at all) `opacity: 0.16` was multiplying both the glow
                 and its reduced-motion outline substitute down to invisible.
                 The .pulse-edge comment in index.css already explains why the
                 cue is a box-shadow rather than an opacity animation; this is
                 the other half of that. */
              background: glowing
                ? `color-mix(in srgb, var(--color-accent2) ${Math.round(alpha * 100)}%, transparent)`
                : d.day === today
                  ? "var(--color-accent2)"
                  : "var(--color-accent)",
              opacity: glowing ? 1 : alpha,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The plaque on the Playground — "you are the 1,204th person through this
 * door", with the last month of arrivals beside it.
 *
 * It only speaks when it knows something: no record and no synced document
 * means it renders nothing at all, the same way the presence badge stays quiet
 * in an empty room.
 */
export function VisitorPlaque() {
  const ledger = useVisitorLedger();
  const { visit, settled } = useMyVisit();
  const total = totalVisitors(ledger);
  const days = recentDays(ledger, isoDay(new Date()), PLAQUE_SPAN);
  const zones = topZones(ledger);
  // A record can exist without a number: the visitor was counted, but the
  // storage write that would have kept their number failed. They get the room
  // total instead of a "№ 0" — counted, just not numbered.
  const myNumber = visit && visit.record.n > 0 ? visit.record.n : null;
  const shown = useCountUp(myNumber ?? total, Boolean(visit?.fresh) && myNumber !== null);

  /* A returning visitor's own number comes out of localStorage and is on
   * screen before the socket is anywhere near ready, while the shared figures
   * are still zero. Rendering them anyway would flash "0 through the door" and
   * an empty month at someone whose own line already says otherwise — so the
   * shared half waits until it actually knows something, and until then the
   * plaque is just your number. Same rule the presence badge follows: say
   * nothing rather than say zero. */
  /* Silent until there is something true to say. A visitor about to be counted
   * is a second away from having their own number, so announcing the room total
   * first would put a figure on screen and then visibly replace it. */
  const knowsRoom = total > 0;
  if (!myNumber && !(settled && knowsRoom)) return null;

  const todayCount = days[days.length - 1]?.count ?? 0;

  return (
    <section
      className="mt-8 flex flex-col gap-6 rounded-2xl border border-line bg-card/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-10"
      aria-label="Visitor count"
    >
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          {myNumber ? (visit?.fresh ? "you are" : "you were") : "so far"}
        </p>
        <p className="font-display mt-1 text-4xl font-bold tabular-nums tracking-tight text-accent">
          <span className="text-muted">№</span> {shown.toLocaleString()}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          {myNumber ? (
            <>
              person through this door
              {visit && visit.record.days > 1 && (
                <span className="text-muted"> · your {ordinal(visit.record.days)} day here</span>
              )}
            </>
          ) : (
            "people have opened one of these rooms"
          )}
        </p>
      </div>

      {knowsRoom && (
        <div className="min-w-0 sm:w-[45%]">
          <div className="kicker flex items-baseline justify-between gap-3">
            <span>visits · last {PLAQUE_SPAN} days</span>
            <span className="text-accent2">{todayCount} today</span>
          </div>
          <DayBars days={days} className="mt-2 h-9" />
          <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
            <span>{total.toLocaleString()} through the door</span>
            {zones.length > 0 && (
              <span className="flex items-center gap-1">
                · <Globe2 size={11} /> {zones.length} time zone{zones.length === 1 ? "" : "s"}
              </span>
            )}
            <Link to="/pulse" className="transition hover:text-accent">
              · the full ledger →
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
