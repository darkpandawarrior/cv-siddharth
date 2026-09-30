import { ClientOnly } from "@tanstack/react-router";
import { EvidenceChip } from "../../EvidenceChip.tsx";
import { storeGeneratedAt } from "../../data/store.ts";
import { useNow } from "../../lib/useSky.ts";
import { globeFacts, liveDotsLabel, weeksAgoLabel } from "./globeRows.ts";
import { usePresenceGeo } from "./presenceGeo.ts";
import SceneSummary from "./ui/SceneSummary.tsx";

const STAMP_BY_ROW: Record<string, string | undefined> = {
  "reach-installs": storeGeneratedAt,
};

const NO_PRESENCE_ROW = <li data-globe-live>{liveDotsLabel({})}</li>;

/** The one piece of GlobePanel that needs a browser: `usePresenceGeo` calls
 *  `@playhtml/react`'s `usePresence`, which the import-protection plugin
 *  denies from the server bundle outright (not a lazy-loaded chunk like
 *  three.js - a hard deny). Kept in its own component so `<ClientOnly>`
 *  below can strip only this from the SSR compile, not the static facts
 *  around it. */
function GlobeLiveRow() {
  const counts = usePresenceGeo();
  return <li data-globe-live>{liveDotsLabel(counts)}</li>;
}

/**
 * GLOBE's fact list (living-ledger-spec.md#6.3 task 5): "SSR/no-WebGL
 * renders the same facts as a list." This is that list - the one component
 * both branches of Globe.tsx render, so a visitor with no WebGL (or a
 * crawler, or the server's own first paint) reads the exact same reach
 * sentences a capable visitor sees beside the 3D scene, never a lesser copy.
 * The static rows (globeFacts) server-render like any other data; only the
 * live presence row needs the client.
 */
export function GlobePanel() {
  // SSR-safe clock (useSky.ts's own pattern): null on the server and on the
  // first client render, so the "(N weeks ago)" suffix below is simply
  // absent from both - never a value computed once at whichever moment the
  // server module happened to load versus whenever the client bundle did,
  // which is what produced a real hydration text mismatch (globeRows.ts's
  // weeksAgoLabel comment has the full story). It fills in one tick after
  // mount, same as the rest of the page's clock-driven text.
  const now = useNow();
  return (
    <div data-globe-panel className="pointer-events-auto">
      <h2 className="sr-only">GLOBE - reach, in numbers</h2>
      <ul className="space-y-2 font-mono text-sm text-zinc-300">
        {globeFacts.map((row) => {
          const stamp = STAMP_BY_ROW[row.id];
          const weeksAgo = stamp && now ? ` (${weeksAgoLabel(stamp, now)})` : "";
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-2">
              {/* min-w-0: a flex item's default min-width is `auto` (its
                  content's natural width), not 0 - the sentence-length labels
                  here (e.g. "install floor across 88 live l...") never wrapped
                  and instead overflowed past the flex row, silently clipped by
                  html's overflow-x:hidden (e2e/overflow.spec.ts). */}
              <span className="min-w-0 basis-full whitespace-normal break-words">{row.label}{weeksAgo}</span>
              <EvidenceChip file={row.file} source={row.source} cadence="manual" stamp={stamp} />
            </li>
          );
        })}
        <ClientOnly fallback={NO_PRESENCE_ROW}>
          <GlobeLiveRow />
        </ClientOnly>
      </ul>
      {/* WAVE 7 LANE V6: the non-visual scene summary — a screen-reader-only
          region describing the 3D scene itself (imagery, layers, hazards,
          sky, selection), not the reach facts above. Mounted here rather
          than Globe.tsx/GlobeHud.tsx (lanes this worktree may not touch)
          because this component already renders unconditionally, SSR and
          no-WebGL included, and SceneSummary needs exactly that floor. */}
      <SceneSummary />
    </div>
  );
}
