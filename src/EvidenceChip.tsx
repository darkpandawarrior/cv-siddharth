import { useEffect, useState } from "react";
import { ageDays, slaFor, stateForAge, type OpsState } from "./data/freshnessSla.ts";

export interface EvidenceChipProps {
  /** The generated file this claim is sourced from, e.g. "chess.ts". Also the
   *  key used to look up its SLA and the anchor this chip links to on /ops. */
  file: string;
  /** The file's own `YYYY-MM-DD` freshness stamp. Omit for a source that has
   *  no cadence at all (renders "cadence not tracked"). */
  stamp?: string;
  /** Where the number came from, in the tooltip sentence — "lichess + chess.com". */
  source: string;
  /** "manual" for a source with no CI path (a hand-run generator, a PDF
   *  import): always reads "manual refresh", regardless of age. Any other
   *  value is accepted and ignored (reserved for a future weekly/etc label). */
  cadence?: string;
}

/** Resolved client-side state, one step past OpsState: "manual" and
 *  "no-stamp" are not staleness verdicts, they are reasons the staleness
 *  math does not apply. Never rendered as the literal word server-side —
 *  null until the mount effect runs, so hydration cannot mismatch. */
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

/**
 * One dated "as of" claim, everywhere the site makes one.
 *
 * SSR (and the client's first paint, before hydration effects run) renders
 * ONLY the absolute date — deterministic at build time, so it can never
 * disagree between server and client. The DEGRADED/BROKEN/manual/no-stamp
 * verdict is computed in a mount effect and only then painted in: the state
 * word itself is never part of the server-rendered markup, so a stale
 * classification can drift day to day (today's `new Date()` vs. build time)
 * without ever producing a hydration mismatch.
 */
export function EvidenceChip({ file, stamp, source, cadence }: EvidenceChipProps) {
  const [state, setState] = useState<ChipState>(null);

  // Deliberate: this state must NOT be derived during render (server and the
  // client's first paint would then compute today's staleness verdict
  // themselves and disagree the instant the day rolls over) — it has to be
  // painted in one tick after mount, once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setState(resolveState(stamp, cadence, file));
  }, [stamp, cadence, file]);

  const dateLabel = stamp ? `as of ${stamp}` : "";
  const sla = slaFor(file);
  const age = stamp ? ageDays(stamp) : null;

  let suffix = "";
  let sentence = dateLabel ? `${dateLabel}, source ${source}` : `${file}, source ${source}`;
  let dotColor: string | undefined;

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

  const visibleText = suffix ? (dateLabel ? `${dateLabel} · ${suffix}` : suffix) : dateLabel;

  return (
    <a
      className="chip-evidence"
      href={`/ops#${file}`}
      title={sentence}
      aria-label={sentence}
      data-evidence-chip
      data-state={state ?? undefined}
    >
      {dotColor && (
        <span
          className="chip-evidence__dot"
          style={{ "--chip-dot-color": dotColor } as React.CSSProperties}
        />
      )}
      <span>{visibleText}</span>
    </a>
  );
}
