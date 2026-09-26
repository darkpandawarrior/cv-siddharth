/**
 * The generic landmark detail panel (this lane's own task list): opens over
 * the running scene for a landmark selected via `LandmarkList.tsx` (or a
 * future in-world dwell prompt), lists that landmark's own facets, and ends
 * with its ledger row — living-ledger-spec §7.2's own citation shape ("Why
 * is this stone here? One merged PR, 2026-08-12, career-ops #2656"), so the
 * panel and the Reality ledger never disagree about where a number comes
 * from.
 */
import type { Landmark } from "./LandmarkList.tsx";
import type { LedgerRow } from "../grammar.ts";

function displayName(name: string): string {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayField(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export interface LandmarkPanelV2Props {
  landmark: Landmark;
  /** `worldModel.rows.find((r) => r.id === "landmark-facet")` — the one row
   *  every one of this landmark's facets binds into (grammar.ts's G14). */
  row: LedgerRow | null;
  onClose: () => void;
}

export function LandmarkPanelV2({ landmark, row, onClose }: LandmarkPanelV2Props) {
  return (
    <div
      role="dialog"
      aria-label={`${displayName(landmark.name)} landmark details`}
      data-landmark={landmark.name}
      className="pointer-events-auto flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-line bg-card/95 p-4 backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-base font-bold text-accent">{displayName(landmark.name)}</span>
        <button type="button" onClick={onClose} className="rounded-full border border-line px-2 py-0.5 text-xs text-zinc-400 hover:border-accent hover:text-accent">
          Close
        </button>
      </div>
      <ul className="flex flex-col gap-1 font-mono text-xs text-text">
        {landmark.facets.map((f) => {
          // Feature.id is `landmark-facet:<name>:<field>` (grammar.ts's own
          // G14 placementSeed) — the field is everything after the name.
          const field = f.id.split(":").slice(2).join(":");
          return (
            <li key={f.id}>
              {displayField(field)}: {f.scalar}
            </li>
          );
        })}
      </ul>
      {row && (
        <p className="border-t border-line pt-2 text-xs text-muted" data-cadence={row.cadence}>
          {row.label} · {row.cadence} · {row.sourceFile}
        </p>
      )}
    </div>
  );
}
