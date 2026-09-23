import { Link } from "@tanstack/react-router";
import { EvidenceChip } from "./EvidenceChip.tsx";
import { systemGraph } from "./data/systemGraph.ts";

/**
 * DESK altitude's cross-links to ORBIT (/map) and STREET (/playground), plus
 * the systemGraph chip and the first-visit guided-tour nudge. Its own
 * React.lazy chunk (not inlined in BlueprintRoom.tsx): this file, and the
 * EvidenceChip/systemGraph modules it alone pulls into the room, would
 * otherwise land inside the same already-63-byte-headroom bundle as
 * Blueprint3D and SketchBoard — measured to matter, not a guess.
 */
export default function BlueprintAtlasPanel({ showTourNudge }: { showTourNudge: boolean }) {
  return (
    <>
      {showTourNudge && (
        <span
          role="status"
          className="pointer-events-none absolute left-1/2 top-[52px] z-20 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-accent2/40 bg-ink px-3 py-2 text-center font-mono text-[11px] text-accent2 shadow-lg animate-pulse"
        >
          new here? start the tour ↑
        </span>
      )}
      <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-1.5 text-[11px]">
        <div className="pointer-events-auto rounded-lg border border-line bg-ink/80 px-2.5 py-1.5 backdrop-blur">
          <EvidenceChip file="systemGraph.ts" stamp={systemGraph.generatedAt} source="registry + includeBuild scan" />
        </div>
        <div className="pointer-events-auto flex gap-1.5 font-mono">
          <Link to="/map" className="rounded-full border border-line bg-ink/80 px-2.5 py-1 text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent">
            orbit
          </Link>
          <Link to="/playground" className="rounded-full border border-line bg-ink/80 px-2.5 py-1 text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent">
            streets
          </Link>
        </div>
      </div>
    </>
  );
}
