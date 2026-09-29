import { useEffect, useRef, useState } from "react";
import { BookOpen, Pause, Play } from "lucide-react";
import { useGlobe, type LayerId } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { buildStory, createStoryPlayer, type StoryChapter, type StoryEvent } from "../story/index.ts";
import { useStoryChapterState } from "./storyChapterState.ts";

/** LANE X4 (story player UI): "My story", a chronological tour built purely
 *  from the site's own data modules (buildStory owns every claim and every
 *  source citation -- this file only renders what it returns and never adds
 *  a fact of its own). Mounted once by Globe.tsx inside the same absolutely
 *  positioned stage Inspector/GlobeTour/StreetView/ExploreBar share, so
 *  every position below resolves against that stage, not the viewport
 *  (except the two `fixed` compact affordances, which deliberately don't --
 *  see their own comments). */

// Static, deterministic, and cheap -- computed once at module load (same
// choice GlobeTour.tsx makes for its own STOPS) rather than re-derived every
// render or refetched from a store no other lane may edit.
const CHAPTERS: StoryChapter[] = buildStory();
const CHAPTER_MS = 6000; // brief: "auto-advance ~6s"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatEventDate(e: StoryEvent): string {
  const [y, m, d] = e.date.split("-").map(Number);
  if (e.precision === "year") return String(y);
  const month = MONTHS[(m ?? 1) - 1];
  return e.precision === "month" ? `${month} ${y}` : `${d} ${month} ${y}`;
}

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

// Mirrors Globe.tsx's own PANEL_RESERVE_RIGHT (249px open / 50px collapsed)
// plus this button's own margin, so the busy-state compact button never
// slides under the right-edge LayerPanel column. Recreated locally rather
// than imported: Globe.tsx doesn't export it, and this lane may not edit
// that file to add an export just for one button.
const FAB_RESERVE_RIGHT = { open: "sm:right-[273px]", collapsed: "sm:right-[74px]" };

const btn = "rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export default function StoryPlayer(_props: { tier: 1 | 2 | 3 }) {
  const selected = useGlobe((s) => s.selected);
  const tourStep = useGlobe((s) => s.tourStep);
  const panelOpen = useGlobe((s) => s.panelOpen);
  const select = useGlobe((s) => s.select);
  const setTourStep = useGlobe((s) => s.setTourStep);
  const flyTo = useGlobe((s) => s.flyTo);
  const toggleLayer = useGlobe((s) => s.toggleLayer);
  const setChapter = useStoryChapterState((s) => s.setChapter);
  const reducedMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const playerRef = useRef(createStoryPlayer(CHAPTERS, Date.now, CHAPTER_MS));
  const [snap, setSnap] = useState(() => playerRef.current.snapshot());
  // Layers this lane switched ON to emphasise a chapter, and only those --
  // restoring means undoing exactly this set, never touching a layer the
  // visitor already had on for their own reasons.
  const forcedLayersRef = useRef<Set<LayerId>>(new Set());

  const activeIndex = snap.chapterIndex;
  const chapter = CHAPTERS[activeIndex];
  const event = chapter.events[0];
  const playing = snap.playing;
  const busy = selected !== null || tourStep !== null;

  // Auto-advance while playing: a plain poll of the player's own clock, not
  // a per-frame WebGL loop -- this is DOM text and dots, not a mesh.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSnap(playerRef.current.snapshot()), 200);
    return () => clearInterval(id);
  }, [playing]);

  function applyChapter(c: StoryChapter) {
    flyTo({ kind: "latlon", lat: c.camera.anchor.lat, lon: c.camera.anchor.lon, distance: c.camera.distance });
    for (const id of c.camera.emphasise) {
      if (!useGlobe.getState().layers[id]) {
        forcedLayersRef.current.add(id);
        toggleLayer(id);
      }
    }
  }

  function restoreLayers() {
    for (const id of forcedLayersRef.current) {
      if (useGlobe.getState().layers[id]) toggleLayer(id);
    }
    forcedLayersRef.current.clear();
  }

  // The chapter card and layers/StoryArc.tsx's own effect both react to the
  // active chapter changing -- entering the story, Back/Next, and each
  // auto-advance tick all funnel through `snap.chapterIndex` here.
  useEffect(() => {
    if (!open) return;
    applyChapter(CHAPTERS[activeIndex]);
    setChapter(CHAPTERS[activeIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyChapter closes over stable store actions
  }, [open, activeIndex]);

  // Unmount safety net (route navigation away mid-story): the same cleanup
  // `exit()` runs, so nothing is left forced on if this component just
  // disappears instead of being explicitly exited.
  useEffect(() => () => { restoreLayers(); setChapter(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") exit();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exit/next/back close over fresh state via the store/player
  }, [open, activeIndex]);

  function enter() {
    select(null);
    setTourStep(null);
    setSnap(playerRef.current.seekChapter(0));
    setOpen(true);
  }
  function exit() {
    playerRef.current.pause();
    restoreLayers();
    setChapter(null);
    setOpen(false);
  }
  function back() { setSnap(playerRef.current.prev()); }
  function next() {
    if (activeIndex === CHAPTERS.length - 1) { exit(); return; }
    setSnap(playerRef.current.next());
  }
  function togglePlay() { setSnap(playing ? playerRef.current.pause() : playerRef.current.play()); }

  if (!open) {
    return (
      <>
        {/* Desktop/tablet, left column free: the full entry pill in the
            shared slot Inspector/GlobeTour's card also use -- safe only
            because neither renders anything there while !busy. */}
        {!busy && (
          <button
            type="button"
            data-story-entry
            onClick={enter}
            className="pointer-events-auto absolute left-4 top-20 z-30 hidden w-fit items-center gap-1.5 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:top-[var(--globe-top-offset,5rem)] sm:inline-flex"
          >
            <BookOpen size={12} aria-hidden /> My story
          </button>
        )}
        {/* Compact fallback: phones always (there is no spare column
            there), and desktop whenever the left slot is busy (a selection
            or the guided tour already showing there). Fixed to the
            viewport, not the stage, so it floats free of both. */}
        <button
          type="button"
          data-story-entry-compact
          onClick={enter}
          aria-label="My story"
          title="My story"
          className={`pointer-events-auto fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${busy ? "sm:flex" : "sm:hidden"} ${panelOpen ? FAB_RESERVE_RIGHT.open : FAB_RESERVE_RIGHT.collapsed}`}
        >
          <BookOpen size={16} aria-hidden />
        </button>
      </>
    );
  }

  const cardBody = (touchTarget: string) => (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-100">{event.title}</h2>
        <button type="button" onClick={exit} aria-label="Exit my story" className={`shrink-0 ${btn} ${touchTarget}`}>
          Exit
        </button>
      </div>
      <p className="mb-1 text-[11px] text-muted" title={event.dateNote}>{formatEventDate(event)}</p>
      <p className="mb-2 text-xs leading-relaxed text-zinc-300">{event.detail}</p>
      {event.metric && (
        <p className="mb-2 text-xs text-zinc-400" title={event.metric.source}>
          {event.metric.value} {event.metric.unit}
        </p>
      )}
      <p className="mb-3 truncate text-[11px] text-muted" title={event.source}>evidence: {event.source}</p>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5" aria-hidden>
        {CHAPTERS.map((c, i) => (
          <span key={c.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i === activeIndex ? "var(--color-signal)" : "#3f3f46" }} />
        ))}
      </div>
      <div className="sticky bottom-0 -mx-3 -mb-3 flex items-center justify-between gap-2 rounded-b-2xl bg-ink/95 px-3 pb-3 pt-2 backdrop-blur">
        <button type="button" onClick={back} disabled={activeIndex === 0} className={`${btn} disabled:opacity-30 ${touchTarget}`}>
          Back
        </button>
        {!reducedMotion && (
          <button type="button" onClick={togglePlay} aria-pressed={playing} aria-label={playing ? "Pause the story" : "Play the story"} className={`${btn} ${touchTarget}`}>
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          </button>
        )}
        <span className="text-xs text-muted">{activeIndex + 1} / {CHAPTERS.length}</span>
        <button type="button" onClick={next} className={`${btn} ${touchTarget}`}>
          {activeIndex === CHAPTERS.length - 1 ? "Done" : "Next"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop/tablet: the shared left slot, same box Inspector.tsx and
          GlobeTour's overlay use -- free for this card because `enter()`
          clears both `selected` and `tourStep` before opening. */}
      <div
        data-story-chapter-card
        data-story-chapter-id={chapter.id}
        role="dialog"
        aria-label="My story"
        className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] overflow-y-auto rounded-2xl border border-line bg-ink/85 p-3 font-mono text-xs text-zinc-300 backdrop-blur sm:top-[var(--globe-top-offset,5rem)] sm:block sm:inset-x-auto sm:left-4 sm:bottom-[calc(45%+16px)] sm:max-h-[calc(100%-45%-16px-var(--globe-top-offset,5rem))]"
      >
        {cardBody("py-1")}
      </div>

      {/* Phone (< 640): a bottom sheet -- this lane's own local state, not
          globeStore's `sheet` (that type is shared with every other wave-6
          lane in parallel; adding a "story" variant to it is out of this
          lane's owned files). */}
      <div
        data-story-chapter-sheet
        data-story-chapter-id={chapter.id}
        role="dialog"
        aria-label="My story"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-ink/90 p-4 font-mono text-xs text-zinc-300 backdrop-blur sm:hidden"
      >
        {cardBody("min-h-11 min-w-11")}
      </div>
    </>
  );
}
