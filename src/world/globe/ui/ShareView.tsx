// LANE C1 ("Share a view"): URL state (feature 1), the Share button
// (feature 2) and the postcard export (feature 3) all live behind one
// mount point, the same "one component, two render sites" shape
// SoundToggle.tsx already established for this file's siblings — the
// desktop icon (Globe.tsx's topbar right cluster, beside the tour pill) and
// the phone in-sheet row (LayerPanel.tsx's Layers-sheet header) share this
// file's own popover and click handlers; only the DEFAULT export's two
// effects (the mount-once restore, the debounced address-bar writer) ever
// run, so mounting both never double-restores or double-writes.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { LAYER_IDS, sceneHandles, useGlobe, type Focus, type GlobeView, type ImageryStack, type LayerId } from "../globeStore.ts";
import { cameraToLatLonAlt, hasShareFields, parseShareState, serializeShareState, type ShareState } from "../globeUrlState.ts";
import { markIntroSeen } from "../cameraIntro.ts";
import { buildPuneSelection, PUNE_SELECTION_ID } from "../puneSelection.ts";
import { capturePostcard } from "./postcard.ts";

// A plain setInterval tick IS the debounce this feature needs: the camera
// moves via OrbitControls drag, entirely outside React state, so there is
// no single "changed" event to debounce off of the usual way (a timer reset
// on every keystroke). Ticking no faster than this interval, and skipping
// the actual `replaceState` call when nothing has changed since the last
// write (see the effect below), satisfies the brief's own words ("at most
// every 500ms, never per frame") without a second timer.
const WRITE_INTERVAL_MS = 500;
const SavedViews = lazy(() => import("./savedViewsPanel.tsx"));
// A fallback camera altitude/lat/lon for the rare tick where the scene
// hasn't published a camera yet (sceneHandles.camera is null before
// GlobeScene's SceneRig mounts) — GlobeScene's own opening camera position
// (CameraDirector.tsx's own INTRO_END_DISTANCE / PUNE-relative start), so a
// link built in that brief window still opens somewhere sensible rather
// than at the globe's centre.
const FALLBACK_LATLONALT = { lat: 18.5204 + 12, lon: 73.8567, alt: 26 };

function currentShareState(): ShareState {
  const s = useGlobe.getState();
  const cam = sceneHandles.camera;
  const { lat, lon, alt } = cam ? cameraToLatLonAlt(cam.position.x, cam.position.y, cam.position.z) : FALLBACK_LATLONALT;
  return {
    lat,
    lon,
    alt,
    view: s.view,
    timeOffsetMin: s.timeOffsetMin,
    layers: LAYER_IDS.filter((id) => s.layers[id]),
    base: s.imagery.base,
    overlays: s.imagery.overlays,
    selectionId: s.selected?.id ?? null,
  };
}

function buildShareUrl(): string {
  return `${location.origin}${location.pathname}?${serializeShareState(currentShareState())}`;
}

async function copyLink(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildShareUrl());
    return true;
  } catch {
    // Clipboard permission denied, insecure context, or no clipboard API at
    // all — the caller shows a neutral fallback rather than claiming a copy
    // that didn't happen.
    return false;
  }
}

/** Applies a parsed (already-validated) share state onto the live store in
 *  one atomic `setState` — the same single-commit shape as any other
 *  multi-field store update in this codebase, and what lets CameraDirector's
 *  existing [view, focus] effect produce the "short fly-in" for free: this
 *  is an ordinary focus/view change to it, not a special restore path. Only
 *  the Pune selection is reconstructible from an id alone (every other
 *  selection's full content — rows, source, spark — is built by a layer
 *  this lane doesn't own); an unrecognised `selectionId` is stored back into
 *  the URL faithfully (round-trip tested) but left un-restored here, same
 *  as any other lane's "known ids only" scope limit. */
function applyRestoredState(parsed: Partial<ShareState>): void {
  const s = useGlobe.getState();
  const next: Partial<{ focus: Focus; view: GlobeView; timeOffsetMin: number; layers: Record<LayerId, boolean>; imagery: ImageryStack }> = {};

  if (parsed.lat !== undefined && parsed.lon !== undefined) {
    next.focus = { kind: "latlon", lat: parsed.lat, lon: parsed.lon, distance: parsed.alt };
  }
  if (parsed.view !== undefined) next.view = parsed.view;
  if (parsed.timeOffsetMin !== undefined) next.timeOffsetMin = parsed.timeOffsetMin;
  if (parsed.layers !== undefined) {
    const layers = { ...s.layers };
    for (const id of LAYER_IDS) layers[id] = parsed.layers.includes(id);
    next.layers = layers;
  }
  if (parsed.base !== undefined || parsed.overlays !== undefined) {
    next.imagery = { base: parsed.base ?? s.imagery.base, overlays: parsed.overlays ?? s.imagery.overlays };
  }
  useGlobe.setState(next);

  if (parsed.selectionId === PUNE_SELECTION_ID) {
    const selection = buildPuneSelection();
    if (selection) useGlobe.getState().select(selection);
  }
}

type ActionStatus = "idle" | "busy" | "link-ok" | "link-failed" | "postcard-ok" | "postcard-failed";

const STATUS_TEXT: Record<ActionStatus, string | null> = {
  idle: null,
  busy: null,
  "link-ok": "Link copied",
  "link-failed": "Couldn't copy. Select the address bar instead",
  "postcard-ok": "Postcard saved",
  "postcard-failed": "Nothing to capture yet. The globe hasn't loaded",
};

/** The shared popover: a Share icon that opens two actions. Both render
 *  sites below mount this with only their own sizing classes differing. */
function SharePopoverButton({ buttonClassName, iconSize }: { buttonClassName: string; iconSize: number }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ActionStatus>("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  }, []);

  function settle(next: ActionStatus): void {
    setStatus(next);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setStatus("idle"), 2200);
  }

  async function onShareOrCopy(): Promise<void> {
    setStatus("busy");
    // Web Share API on phones (brief: "use the Web Share API when
    // available on phones") — the same < 640 phone boundary Globe.tsx's own
    // preselect-Pune effect and every bottom-sheet check in this codebase
    // already use, not `tier` (a performance/GPU tier, not a form factor).
    if (typeof navigator.share === "function" && typeof window !== "undefined" && window.innerWidth < 640) {
      try {
        await navigator.share({ url: buildShareUrl(), title: "Siddharth Pandalai · the globe" });
        setOpen(false);
        setStatus("idle");
        return;
      } catch {
        // Cancelled by the visitor, or the OS sheet itself failed — fall
        // through to the clipboard rather than leaving the button stuck on
        // "busy".
      }
    }
    settle((await copyLink()) ? "link-ok" : "link-failed");
  }

  async function onPostcard(): Promise<void> {
    setStatus("busy");
    settle((await capturePostcard()) ? "postcard-ok" : "postcard-failed");
  }

  const statusText = STATUS_TEXT[status];

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <Suspense fallback={null}><SavedViews capture={currentShareState} className={buttonClassName} /></Suspense>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label="Share this view" title="Share" data-share-button className={buttonClassName}>
        <Share2 size={iconSize} aria-hidden />
      </button>
      {open && (
        <div
          data-share-panel
          className="pointer-events-auto absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-2xl glass-panel font-mono text-xs text-zinc-300"
        >
          <button
            type="button"
            onClick={onShareOrCopy}
            data-share-copy
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {status === "link-ok" ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            <span>Copy link to this view</span>
          </button>
          <button
            type="button"
            onClick={onPostcard}
            data-postcard-download
            className="flex min-h-11 w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {status === "postcard-ok" ? <Check size={13} aria-hidden /> : <Download size={13} aria-hidden />}
            <span>Download postcard (PNG)</span>
          </button>
          <p data-share-status aria-live="polite" className={`px-3 pb-2.5 text-xs ${status === "link-failed" || status === "postcard-failed" ? "text-warn" : "text-signal"}`}>
            {statusText}
          </p>
        </div>
      )}
    </div>
  );
}

/** Desktop/tablet (sm+): an icon button IN the topbar's right cluster
 *  (Globe.tsx mounts this beside GlobeTour's idle pill and SoundToggle,
 *  same "in flow, not absolutely offset" fix those siblings' own comments
 *  document). This is also the ONLY instance that runs the restore-on-mount
 *  and debounced-write effects below — mounted unconditionally regardless
 *  of viewport (CSS-hidden under sm, per SoundToggle.tsx's own precedent),
 *  so both effects are live on every device even though the button itself
 *  only paints on sm+. */
export default function ShareView({ tier: _tier }: { tier: 1 | 2 | 3 }) {
  // Lazy initializer, not an effect: this runs during the render phase,
  // which happens for every mounted component before ANY component's
  // effects fire in the same commit. Calling markIntroSeen() here — before
  // ui/Intro.tsx's own effect ever reads hasSeenIntro() — is what makes
  // suppressing the cinematic race-free regardless of which of the two
  // components happens to sit first in Globe.tsx's Suspense list.
  const [shareState] = useState<Partial<ShareState> | null>(() => {
    if (typeof window === "undefined") return null;
    const parsed = parseShareState(window.location.search);
    if (hasShareFields(parsed)) markIntroSeen();
    return parsed;
  });

  useEffect(() => {
    if (shareState && hasShareFields(shareState)) applyRestoredState(shareState);
    // Mount-once: `shareState` is a lazy-initial value that never changes
    // identity after the first render, so this is exactly "run once, after
    // mount" without needing an empty literal dependency array to lie about
    // reading it.
  }, [shareState]);

  const lastWrittenRef = useRef<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setInterval(() => {
      const qs = serializeShareState(currentShareState());
      if (qs === lastWrittenRef.current) return;
      lastWrittenRef.current = qs;
      // Scene state is restored only on mount. Keep this entry's router state
      // and avoid TanStack's patched writer starting a navigation/transition.
      History.prototype.replaceState.call(window.history, window.history.state, "", `${location.pathname}?${qs}`);
    }, WRITE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <SharePopoverButton
      buttonClassName="pointer-events-auto hidden h-11 w-11 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex"
      iconSize={13}
    />
  );
}

/** Phone-only in-sheet row: LayerPanel.tsx mounts this inside the Layers
 *  sheet's own header, next to SoundToggleSlot — same shape, same reason
 *  (a floating second button over that sheet's own content is what
 *  SoundToggle.tsx's own header comment already retired). Runs no side
 *  effects of its own; the default export above is always mounted too
 *  (CSS-hidden on phones) and owns the restore/write effects, so there is
 *  never a double-restore or a double-write regardless of which of these
 *  two instances the visitor actually sees. */
export function ShareSlot() {
  return (
    <SharePopoverButton
      buttonClassName="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      iconSize={16}
    />
  );
}
