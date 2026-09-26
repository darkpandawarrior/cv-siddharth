/**
 * The world-v2 Reality ledger (living-ledger-spec §7): five sections (SKY /
 * RIVER / LAND / PEOPLE / REACH) plus an "Ambient (no claim)" footer, built
 * from `GRAMMAR` + `STREAMS` via `ledgerRows.ts` — no hand-written row lives
 * in this file. Row hover sets `data-highlighted` on every scene instance
 * bound to that row (`GrammarInstancesDom`'s own mirror), via `onHoverRow`.
 * The header reads `worldModel.diff.sentence` — visitDiff.ts's own "Since
 * you were last here" sentence (§7.3) — verbatim.
 *
 * Same shape as v1's `RealityLedger` (Hud.tsx): a dialog toggled by the `R`
 * key or a HUD button, a day-preview scrubber, one line saying nothing
 * fetched here is hidden when it fails.
 */
import type { LedgerSections, SectionRow } from "./ledgerRows.ts";

function SectionList({ title, rows, onHoverRow }: { title: string; rows: readonly SectionRow[]; onHoverRow: (ruleId: string | null) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-widest text-muted">{title}</span>
      <ul className="flex flex-col gap-0.5 font-mono text-xs text-text">
        {rows.map((row) => (
          <li
            key={row.id}
            data-ledger-row={row.id}
            data-cadence={row.cadence}
            tabIndex={0}
            onMouseEnter={() => onHoverRow(row.id)}
            onMouseLeave={() => onHoverRow(null)}
            onFocus={() => onHoverRow(row.id)}
            onBlur={() => onHoverRow(null)}
          >
            {row.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface LedgerPanelProps {
  open: boolean;
  sections: LedgerSections;
  /** visitDiff.ts's own sentence (worldModel.diff.sentence), or null before
   *  the world model has resolved. */
  sinceSentence: string | null;
  onHoverRow: (ruleId: string | null) => void;
  previewMinutes: number | null;
  onPreviewChange: (minutes: number | null) => void;
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function LedgerPanel({ open, sections, sinceSentence, onHoverRow, previewMinutes, onPreviewChange }: LedgerPanelProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Reality ledger"
      data-world-ledger
      className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-line bg-card/95 p-4 backdrop-blur"
    >
      {sinceSentence && <p className="font-mono text-xs text-accent">{sinceSentence}</p>}

      <SectionList title="Sky" rows={sections.SKY} onHoverRow={onHoverRow} />
      <SectionList title="River" rows={sections.RIVER} onHoverRow={onHoverRow} />
      <SectionList title="Land" rows={sections.LAND} onHoverRow={onHoverRow} />
      <SectionList title="People" rows={sections.PEOPLE} onHoverRow={onHoverRow} />
      <SectionList title="Reach" rows={sections.REACH} onHoverRow={onHoverRow} />

      {sections.ambient.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Ambient (no claim)</span>
          <ul className="flex flex-col gap-0.5 font-mono text-xs text-muted">
            {sections.ambient.map((row) => (
              <li key={row.id} data-ambient-row={row.id}>
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <input
          type="range"
          min={0}
          max={1439}
          value={previewMinutes ?? 720}
          aria-label="Preview a time of day (IST)"
          onChange={(e) => onPreviewChange(Number(e.target.value))}
          className="flex-1"
        />
        {previewMinutes !== null && (
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--state-degraded)" }}>
            PREVIEW {hhmm(previewMinutes)} IST, not live
          </span>
        )}
        {previewMinutes !== null && (
          <button
            type="button"
            onClick={() => onPreviewChange(null)}
            className="rounded-full border border-line bg-card/80 px-2.5 py-1 text-xs text-zinc-400 hover:border-accent hover:text-accent"
          >
            Back to now
          </button>
        )}
      </div>

      <p className="pt-1 text-xs text-muted">Nothing fetched here is hidden when it fails. It is marked.</p>
    </div>
  );
}
