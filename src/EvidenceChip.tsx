import { useEffect, useState } from "react";
import { ageDays, slaFor, stateForAge, type OpsState } from "./data/freshnessSla.ts";

/** Every cadence the plan names (M8), implemented in one pass since this is
 *  the only owner in the whole plan: weekly/manual are the original dated
 *  behaviour; live is a bus reading with its own ok/at; computed is pure
 *  math with no fetch (the sun); modelled is a live model's output (GloFAS,
 *  CAMS); undated is a record with no date at all. No later lane edits this
 *  file — they only ever pass a cadence prop. */
export type Cadence = "weekly" | "manual" | "live" | "computed" | "modelled" | "undated";

export interface EvidenceChipProps {
  /** The generated file this claim is sourced from, e.g. "chess.ts". Also the
   *  key used to look up its SLA and the anchor this chip links to on /ops.
   *  For a non-generated cadence (live/computed/modelled/undated) this is
   *  still the /ops anchor, even though no freshness SLA applies to it. */
  file: string;
  /** The file's own `YYYY-MM-DD` freshness stamp (weekly/manual), or a
   *  modelled reading's own date ("modelled · GloFAS · 2026-09-23"). Omit
   *  for a source that has no cadence or date at all. */
  stamp?: string;
  /** Where the number came from, in the tooltip sentence — "lichess + chess.com". */
  source: string;
  /** "weekly"/undefined and "manual" behave exactly as before (dated, SLA-driven).
   *  "live"/"computed"/"modelled"/"undated" are new (reality P6, living-ledger §7.1). */
  cadence?: Cadence;
  /** cadence="live" only: the reading's own timestamp and health, straight
   *  off the shared bus (e.g. useWeather()). `at: null` reads the same as
   *  `ok: false` — nothing to show a time for. */
  live?: { at: string | null; ok: boolean };
  /** cadence="live" only, used when `!live.ok`: the bus's next scheduled
   *  poll (useLiveSignal's `nextPollAt`) — turns a flat failure into
   *  "unavailable, retrying in N s" (idea-atlas SYS-3). Omit it (bus paused,
   *  or the caller doesn't have it) and the chip falls back to the flat
   *  reading. */
  nextPollAt?: number | null;
  /** The caller ran src/lib/plausibility.ts against the raw value and it
   *  failed a bound (temperature outside 5-45 C, cloud outside 0-100, a
   *  timestamp in the future): draw a hollow amber ring instead of quietly
   *  trusting it. A shape, not a fourth colour — works with every cadence,
   *  not just "live". Prop-driven, so it is safe to render on both the
   *  server and the client's first paint: it never depends on `Date.now()`. */
  suspect?: boolean;
}

/** Resolved client-side state for the weekly/manual (original) cadence only
 *  — every other cadence is prop-driven and needs no age math. Never
 *  rendered as the literal word server-side — null until the mount effect
 *  runs, so hydration cannot mismatch. */
type ChipState = OpsState | "manual" | "no-stamp" | null;

/** Exported for EvidenceChip.test.ts: the state derivation is pure and worth
 *  testing directly, since renderToString (SSR, and the client's first
 *  paint) never runs the mount effect that calls it. */
export function resolveState(stamp: string | undefined, cadence: string | undefined, file: string): ChipState {
  if (cadence === "manual") return "manual";
  if (!stamp) return "no-stamp";
  return stateForAge(ageDays(stamp), slaFor(file));
}

const DOT_TOKEN: Partial<Record<OpsState, string>> = {
  DEGRADED: "var(--state-degraded)",
  BROKEN: "var(--state-broken)",
};

/** `HH:MM IST`, the one time format every live reading on the site uses. */
function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

/** "unavailable, retrying in N s" — the shared bus already knows when it
 *  polls next, so a DEGRADED live chip can say something truer than a flat
 *  failure (idea-atlas SYS-3). Exported so the countdown math is testable
 *  without a live timer. */
export function retryText(nextPollAt: number, now: number): string {
  const secs = Math.max(0, Math.ceil((nextPollAt - now) / 1000));
  return `unavailable, retrying in ${secs} s`;
}

/**
 * One dated "as of" claim, everywhere the site makes one.
 *
 * SSR (and the client's first paint, before hydration effects run) renders
 * ONLY deterministic text: the absolute date for weekly/manual, the bare
 * source name for a live chip (P6: "the source name and nothing else" — a
 * live reading only ever exists client-side, so there is nothing honest to
 * say about it before mount), and the fixed, date-free-or-caller-supplied
 * sentence for computed/modelled/undated, none of which depend on "now".
 * The weekly cadence's DEGRADED/BROKEN verdict and a live chip's OK/
 * DEGRADED/retry reading both depend on the clock, so both are painted in
 * one tick after mount and never server-rendered — the state word itself is
 * never part of the server-rendered markup, so it can never disagree
 * between server and client. `suspect` is a plain prop, not a clock read, so
 * it renders on every pass with no risk of mismatch.
 */
export function EvidenceChip({ file, stamp, source, cadence, live, nextPollAt, suspect }: EvidenceChipProps) {
  const [state, setState] = useState<ChipState>(null);
  // `Date.now()` is impure, so it may only ever be read inside the effect,
  // never during render — this doubles as the "have we mounted yet" flag
  // for the live cadence below (null pre-mount, a real instant after).
  const [mountedAt, setMountedAt] = useState<number | null>(null);

  // Deliberate: none of these may be derived during render (server and the
  // client's first paint would then compute today's/right-now's verdict
  // themselves and disagree the instant the clock moves) — all are painted
  // in one tick after mount, once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setState(resolveState(stamp, cadence, file));
    setMountedAt(Date.now());
  }, [stamp, cadence, file]);

  let visibleText: string;
  let sentence: string;
  let dotColor: string | undefined;

  if (cadence === "live") {
    if (mountedAt === null) {
      visibleText = source;
      sentence = `${file}, source ${source}`;
    } else if (live && live.ok && live.at) {
      const t = istTime(live.at);
      visibleText = `live · ${t} IST`;
      sentence = `live as of ${t} IST, source ${source}`;
    } else {
      dotColor = DOT_TOKEN.DEGRADED;
      visibleText = nextPollAt != null ? retryText(nextPollAt, mountedAt) : "unavailable right now";
      sentence = `${file} is unavailable right now, source ${source}`;
    }
  } else if (cadence === "computed") {
    visibleText = `computed · ${source}`;
    sentence = `Computed, source ${source}`;
  } else if (cadence === "modelled") {
    visibleText = stamp ? `modelled · ${source} · ${stamp}` : `modelled · ${source}`;
    sentence = stamp ? `Modelled ${stamp}, source ${source}` : `Modelled, source ${source}`;
  } else if (cadence === "undated") {
    visibleText = "undated";
    sentence = `${file} carries no date, source ${source}`;
  } else {
    // weekly (default) and manual — the original dated behaviour, unchanged.
    const dateLabel = stamp ? `as of ${stamp}` : "";
    const sla = slaFor(file);
    const age = stamp ? ageDays(stamp) : null;
    let suffix = "";
    sentence = dateLabel ? `${dateLabel}, source ${source}` : `${file}, source ${source}`;

    if (state === "manual") {
      suffix = "manual refresh";
      sentence = dateLabel
        ? `${dateLabel} (manually refreshed), source ${source}`
        : `Manually refreshed, source ${source}`;
    } else if (state === "no-stamp") {
      suffix = "cadence not tracked";
      sentence = `${file} carries no freshness stamp, source ${source}`;
    } else if (state === "DEGRADED" && age !== null) {
      suffix = `${age}/${sla} d`;
      dotColor = DOT_TOKEN.DEGRADED;
      sentence = `${dateLabel}, ${age} of ${sla} days into its freshness window, source ${source}`;
    } else if (state === "BROKEN") {
      suffix = "stale";
      dotColor = DOT_TOKEN.BROKEN;
      sentence = `${dateLabel}, stale past its ${sla}-day freshness window, source ${source}`;
    }
    // state === "OK" or null (not yet mounted): dateLabel alone, no dot — this
    // is also exactly what the server rendered, so there is nothing to paint in.
    visibleText = suffix ? (dateLabel ? `${dateLabel} · ${suffix}` : suffix) : dateLabel;
  }

  const ring = suspect === true;
  if (ring) sentence = `${sentence} (SUSPECT: failed a plausibility check)`;

  return (
    <a
      className="chip-evidence"
      href={`/ops#${file}`}
      title={sentence}
      aria-label={sentence}
      data-evidence-chip
      data-cadence={cadence ?? "weekly"}
      data-state={state ?? undefined}
      data-suspect={ring ? "true" : undefined}
    >
      {ring ? (
        <span className="chip-evidence__ring" aria-hidden />
      ) : (
        dotColor && (
          <span
            className="chip-evidence__dot"
            style={{ "--chip-dot-color": dotColor } as React.CSSProperties}
          />
        )
      )}
      <span>{visibleText}</span>
    </a>
  );
}
