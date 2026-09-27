/**
 * PATH CONTROLS — this lane's own HUD surface (idea-atlas.md PATH-7/PATH-3
 * "your route through the valley is a replayable link"; SYS-4's Sense HUD
 * line). `layers.ts`'s `hud/*.tsx` glob discovers this file by its two
 * exports the same way `hud/AltitudeRailV2.tsx` already does — `HudV2.tsx`
 * is never edited to mount it.
 *
 * Two independent jobs share this one file because they're this lane's
 * only HUD surface (`owns`) and both need a DOM sibling, never a canvas
 * layer:
 *  1. Path share — `sessionRipple.ts`'s `useTouched()` already tracks the
 *     visitor's whole site path; this narrows it to landmark ids
 *     (`pathShare.ts`'s own known-id set), builds a `?path=` link, and on
 *     mount seeds `touch()` from whatever `?path=` the visitor arrived
 *     with, so a shared link lights up those landmarks the same way a
 *     visitor's own dwelling would (`WorldV2.tsx`'s `you.touched` already
 *     feeds every GRAMMAR rule that reads it).
 *  2. The Sense's HUD line — `sense.ts`'s `subscribeSense` is how
 *     `layers/Echo.tsx` (a canvas layer, no DOM) reaches this DOM surface;
 *     see `sense.ts`'s own module doc for why that's a small pub/sub
 *     rather than a prop (`layers.ts`'s layers take none).
 */
import { useEffect, useRef, useState } from "react";
import { Check, Users } from "lucide-react";
import { useTouched, touch } from "../../../lib/sessionRipple.ts";
import { buildShareUrl, decodePath, KNOWN_LANDMARK_IDS, PATH_SHARE_PARAM } from "../../../lib/pathShare.ts";
import { subscribeSense, type SenseEvent } from "../sense.ts";

export const layer = { id: "path-controls", order: 70 };

/** How long the Sense's "someone else is here" line stays up. */
const SENSE_LINE_MS = 4200;

export default function PathControls() {
  const touched = useTouched();
  const [copied, setCopied] = useState(false);
  const [senseEvent, setSenseEvent] = useState<SenseEvent | null>(null);

  // Seed the touched path from a shared `?path=` link, once, on mount.
  useEffect(() => {
    const decoded = decodePath(new URLSearchParams(window.location.search).get(PATH_SHARE_PARAM));
    for (const id of decoded) touch(id);
    // Deliberately empty deps: this is a one-time "arrived via a shared
    // link" seed, not a live sync with the URL (sessionRipple.ts's own
    // module doc: the touched list is local-only, never re-derived from
    // the address bar after the first read).
  }, []);

  const senseLineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeSense((event) => {
      setSenseEvent(event);
      if (senseLineTimerRef.current) clearTimeout(senseLineTimerRef.current);
      senseLineTimerRef.current = setTimeout(() => setSenseEvent((current) => (current === event ? null : current)), SENSE_LINE_MS);
    });
    return () => {
      unsubscribe();
      if (senseLineTimerRef.current) clearTimeout(senseLineTimerRef.current);
    };
  }, []);

  const landmarkIds = touched.filter((id) => KNOWN_LANDMARK_IDS.has(id));

  const onCopy = async () => {
    if (landmarkIds.length === 0) return;
    const url = buildShareUrl(window.location.href, landmarkIds);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — nothing else to do */
    }
  };

  return (
    <div className="pointer-events-none absolute bottom-24 left-4 z-10 flex flex-col items-start gap-2 sm:bottom-4">
      {senseEvent && (
        <div
          data-sense-line={senseEvent.message}
          className="pointer-events-none flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-3 py-1 font-mono text-xs text-accent backdrop-blur"
        >
          <Users size={12} /> {senseEvent.message}
        </div>
      )}

      {landmarkIds.length > 0 && (
        <button
          type="button"
          data-path-share
          onClick={onCopy}
          disabled={landmarkIds.length === 0}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 backdrop-blur transition hover:border-accent hover:text-accent"
        >
          {copied ? <Check size={12} /> : null} {copied ? "Path link copied" : `Copy your path (${landmarkIds.length})`}
        </button>
      )}
    </div>
  );
}
