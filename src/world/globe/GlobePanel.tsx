import { ClientOnly } from "@tanstack/react-router";
import { EvidenceChip } from "../../EvidenceChip.tsx";
import { storeGeneratedAt } from "../../data/store.ts";
import { globeFacts, liveDotsLabel } from "./globeRows.ts";
import { usePresenceGeo } from "./presenceGeo.ts";
import { lazy, Suspense } from "react";

const SceneSummary = lazy(() => import("./ui/SceneSummary.tsx"));

const STAMP_BY_ROW: Record<string, string | undefined> = {
  "reach-installs": storeGeneratedAt,
};

const PRESENCE_ROW_CLASS = "sm:flex sm:min-h-12 sm:items-center sm:pr-[392px]";
const NO_PRESENCE_ROW = <li data-globe-live className={PRESENCE_ROW_CLASS}>{liveDotsLabel({})}</li>;

/** The one piece of GlobePanel that needs a browser: `usePresenceGeo` calls
 *  `@playhtml/react`'s `usePresence`, which the import-protection plugin
 *  denies from the server bundle outright (not a lazy-loaded chunk like
 *  three.js - a hard deny). Kept in its own component so `<ClientOnly>`
 *  below can strip only this from the SSR compile, not the static facts
 *  around it. */
function GlobeLiveRow() {
  const counts = usePresenceGeo();
  return <li data-globe-live className={PRESENCE_ROW_CLASS}>{liveDotsLabel(counts)}</li>;
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
  return (
    <div data-globe-panel className="pointer-events-auto relative">
      <h2 className="sr-only">GLOBE - reach, in numbers</h2>
      <Suspense fallback={null}><SceneSummary /></Suspense>
      <ul className="space-y-2 font-mono text-sm text-zinc-300">
        {globeFacts.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2">
            {/* min-w-0: a flex item's default min-width is `auto` (its
                content's natural width), not 0 - the sentence-length labels
                here (e.g. "install floor across 88 live l...") never wrapped
                and instead overflowed past the flex row, silently clipped by
                html's overflow-x:hidden (e2e/overflow.spec.ts). */}
            <span className="min-w-0 basis-full whitespace-normal break-words">{row.label}</span>
            <EvidenceChip file={row.file} source={row.source} cadence="manual" stamp={STAMP_BY_ROW[row.id]} />
          </li>
        ))}
        <ClientOnly fallback={NO_PRESENCE_ROW}>
          <GlobeLiveRow />
        </ClientOnly>
      </ul>
    </div>
  );
}
