/**
 * The label/value/sub stat triplet shared across the Lab Bench instruments.
 * Extracted out of SignalLab.tsx, which was the only file that had it, so
 * Crash Lab and Gateway Lab can stop hiding their own "before" number the
 * moment a toggle flips (they already track it, they just never rendered it
 * next to the "after").
 */
export type FigureTone = "good" | "bad" | "neutral" | "baseline";

const TONE_CLASS: Record<FigureTone, string> = {
  good: "text-accent",
  bad: "text-warn",
  neutral: "text-zinc-200",
  // raw GPS isn't wrong the way a bug is wrong — it's the reference the
  // engine's claim is measured against, so it reads as its own channel
  // (cyan) rather than as "bad" (amber-flagged, CAL-1's failure colour).
  baseline: "text-accent2",
};

export function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: FigureTone }) {
  return (
    <div className="bg-void/70 px-5 py-3">
      <p className="kicker">{label}</p>
      <p className={`font-display text-xl font-bold ${TONE_CLASS[tone]}`}>{value}</p>
      <p className="font-mono text-[11px] text-muted">{sub}</p>
    </div>
  );
}
