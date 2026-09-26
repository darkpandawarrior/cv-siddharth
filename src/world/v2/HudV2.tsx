/**
 * WorldV2's DOM overlay — the accessible surface of `/playground?world=v2`
 * (the design doc's "a screen reader gets the grid, not a described car",
 * carried over from v1's `Hud.tsx`): the Reality ledger, the always-present
 * hidden landmark list, and the landmark detail panel when one is open.
 * Rendered as a sibling of `<Canvas>` (WorldV2.tsx owns that split), never
 * inside it.
 */
import { useEffect, useState } from "react";
import { Sunrise } from "lucide-react";
import { LedgerPanel } from "./LedgerPanel.tsx";
import { LandmarkList, landmarksFromFeatures, type Landmark } from "./hud/LandmarkList.tsx";
import { LandmarkPanelV2 } from "./hud/LandmarkPanelV2.tsx";
import { HUD_LAYERS } from "./layers.ts";
import type { LedgerSections } from "./ledgerRows.ts";
import type { LedgerRow } from "./grammar.ts";
import type { Feature } from "./worldModel.ts";

export interface HudV2Props {
  sections: LedgerSections;
  sinceSentence: string | null;
  features: readonly Feature[];
  rows: readonly LedgerRow[];
  highlightedRule: string | null;
  onHoverRow: (ruleId: string | null) => void;
  previewMinutes: number | null;
  onPreviewChange: (minutes: number | null) => void;
}

export function HudV2({ sections, sinceSentence, features, rows, highlightedRule, onHoverRow, previewMinutes, onPreviewChange }: HudV2Props) {
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select|button)$/i.test(target.tagName)) return;
      setLedgerOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const landmarks: Landmark[] = landmarksFromFeatures(features);
  const activeLandmark = landmarks.find((l) => l.name === selectedLandmark) ?? null;
  const landmarkRow = rows.find((r) => r.id === "landmark-facet") ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4">
      {/* Every landmark this world model knows about, reachable by Tab even
          though the Canvas above is aria-hidden — this lane's own
          accessible-landmark-list task. */}
      <LandmarkList landmarks={landmarks} onEnter={setSelectedLandmark} />

      {/* Sibling HUD layers a later lane adds without editing this file
          (P2-10b's AltitudeRailV2.tsx is the first) — see layers.ts's own
          doc comment. */}
      {HUD_LAYERS.map((layer) => (
        <layer.Component key={layer.id} />
      ))}

      <div className="pointer-events-auto flex w-full justify-center">
        <LedgerPanel
          open={ledgerOpen}
          sections={sections}
          sinceSentence={sinceSentence}
          onHoverRow={onHoverRow}
          previewMinutes={previewMinutes}
          onPreviewChange={onPreviewChange}
        />
      </div>

      {activeLandmark && (
        <div className="pointer-events-auto flex w-full justify-center">
          <LandmarkPanelV2 landmark={activeLandmark} row={landmarkRow} onClose={() => setSelectedLandmark(null)} />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-pressed={ledgerOpen}
          onClick={() => setLedgerOpen((v) => !v)}
          className={`pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm backdrop-blur transition ${
            ledgerOpen ? "border-accent bg-accent/15 text-accent" : "border-line bg-card/80 text-zinc-400 hover:border-accent hover:text-accent"
          }`}
        >
          <Sunrise size={14} /> <span className="hidden sm:inline">Reality</span>
          <span className="sr-only sm:hidden">Toggle the Reality ledger</span>
        </button>
      </div>

      {/* Whichever rule the ledger (or nothing) currently highlights, mirrored
          onto the DOM for a Playwright probe or an assistive script — the
          same "world state also lands on a real DOM node" idiom
          data-reality-rain uses in v1's Hud.tsx. */}
      <span className="sr-only" data-highlighted-rule={highlightedRule ?? ""} />
    </div>
  );
}
