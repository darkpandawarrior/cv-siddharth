import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Clapperboard, Pause, Play, SkipForward } from "lucide-react";
import { useGlobe, type LayerId } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { buildStory, createStoryPlayer, type StoryChapter, type StoryEvent } from "../story/index.ts";
import { buildStoryFilm, type FilmChapter } from "../story/storyFilm.ts";
import { useStoryChapterState } from "./storyChapterState.ts";
import { useStoryFilmState } from "./storyFilmState.ts";
import StoryFilmstrip from "./storyFilmstrip.tsx";

/** LANE X4 (story player UI): "My story", a chronological tour built purely
 *  from the site's own data modules (buildStory owns every claim and every
 *  source citation -- this file only renders what it returns and never adds
 *  a fact of its own). Mounted once by Globe.tsx inside the same absolutely
 *  positioned stage Inspector/GlobeTour/StreetView/ExploreBar share, so
 *  every position below resolves against that stage, not the viewport
 *  (except the `fixed` compact affordances, which deliberately don't --
 *  see their own comments).
 *
 *  LANE C3 adds a second, independent player in this same file: "Life
 *  journey film", the four dated life chapters (story/storyFilm.ts) played
 *  in the owner's own fixed order -- Kuwait City, Bhopal, Chandigarh, Pune
 *  -- each arriving with its own arc into that city drawn progressively
 *  (layers/StoryArc.tsx) and a small filmstrip of that city's own Google
 *  Maps photos (ui/storyFilmstrip.tsx). "My story" and the film share the
 *  same entry-button row and the same forced-layer bookkeeping, but never
 *  open at once -- entering one always closes the other first. */

// Static, deterministic, and cheap -- computed once at module load (same
// choice GlobeTour.tsx makes for its own STOPS) rather than re-derived every
// render or refetched from a store no other lane may edit.
const CHAPTERS: StoryChapter[] = buildStory();
const FILM_CHAPTERS: FilmChapter[] = buildStoryFilm();
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

const btn = "rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const pill = "pointer-events-auto flex w-fit items-center gap-1.5 rounded-full glass-panel px-3 py-1.5 font-mono text-xs text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export default function StoryPlayer(_props: { tier: 1 | 2 | 3 }) {
  const selected = useGlobe((s) => s.selected);
  const tourStep = useGlobe((s) => s.tourStep);
  const sheet = useGlobe((s) => s.sheet);
  const select = useGlobe((s) => s.select);
  const setTourStep = useGlobe((s) => s.setTourStep);
  const flyTo = useGlobe((s) => s.flyTo);
  const toggleLayer = useGlobe((s) => s.toggleLayer);
  const setChapter = useStoryChapterState((s) => s.setChapter);
  const setFilm = useStoryFilmState((s) => s.setFilm);
  const reducedMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [filmOpen, setFilmOpen] = useState(false);
  const playerRef = useRef(createStoryPlayer(CHAPTERS, Date.now, CHAPTER_MS));
  const filmPlayerRef = useRef(createStoryPlayer(FILM_CHAPTERS, Date.now, CHAPTER_MS));
  const [snap, setSnap] = useState(() => playerRef.current.snapshot());
  const [filmSnap, setFilmSnap] = useState(() => filmPlayerRef.current.snapshot());
  // Layers either player switched ON to emphasise a chapter, and only those
  // -- restoring means undoing exactly this set, never touching a layer the
  // visitor already had on for their own reasons. Shared: "My story" and the
  // film never run at once, so one set is enough for both.
  const forcedLayersRef = useRef<Set<LayerId>>(new Set());

  const activeIndex = snap.chapterIndex;
  const chapter = CHAPTERS[activeIndex];
  const event = chapter.events[0];
  const playing = snap.playing;

  const activeFilmIndex = filmSnap.chapterIndex;
  const filmChapter = FILM_CHAPTERS[activeFilmIndex];
  const filmEvent = filmChapter.events[0];
  const filmPlaying = filmSnap.playing;

  const busy = selected !== null || tourStep !== null;

  // Auto-advance while playing: a plain poll of each player's own clock, not
  // a per-frame WebGL loop -- this is DOM text and dots, not a mesh.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSnap(playerRef.current.snapshot()), 200);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => {
    if (!filmPlaying) return;
    const id = setInterval(() => setFilmSnap(filmPlayerRef.current.snapshot()), 200);
    return () => clearInterval(id);
  }, [filmPlaying]);

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

  // Flies and forces layers only when the ACTIVE CHAPTER changes, never on
  // every 200ms progress tick -- CameraDirector gets one flyTo per city, not
  // five a second. layers/StoryArc.tsx grows the arc from the separate
  // progress write below, which does run every tick.
  useEffect(() => {
    if (!filmOpen) return;
    applyChapter(FILM_CHAPTERS[activeFilmIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyChapter closes over stable store actions
  }, [filmOpen, activeFilmIndex]);

  // The one thing that changes every tick: how far into this chapter's own
  // arc the film has drawn. Separate from the chapter-change effect above on
  // purpose -- StoryArc.tsx reads `progress` every render, `applyChapter`
  // above must not re-run that often.
  useEffect(() => {
    setFilm(filmOpen ? FILM_CHAPTERS[filmSnap.chapterIndex] : null, filmSnap.chapterProgress);
  }, [filmOpen, filmSnap, setFilm]);

  // Unmount safety net (route navigation away mid-story/mid-film): the same
  // cleanup exit()/exitFilm() run, so nothing is left forced on if this
  // component just disappears instead of being explicitly exited.
  useEffect(() => () => { restoreLayers(); setChapter(null); setFilm(null, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!filmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") exitFilm();
      else if (e.key === "ArrowRight") filmNext();
      else if (e.key === "ArrowLeft") filmBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exitFilm/filmNext/filmBack close over fresh state via the store/player
  }, [filmOpen, activeFilmIndex]);

  useEffect(() => {
    if (sheet === "story" && !selected && tourStep === null) return;
    if (open) exit();
    if (filmOpen) exitFilm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- player cleanup uses stable store actions
  }, [sheet, selected, tourStep]);

  function enter() {
    if (filmOpen) exitFilm();
    select(null);
    setTourStep(null);
    setSnap(playerRef.current.seekChapter(0));
    useGlobe.getState().setSheet("story");
    setOpen(true);
  }
  function exit() {
    playerRef.current.pause();
    restoreLayers();
    setChapter(null);
    setOpen(false);
    if (useGlobe.getState().sheet === "story") useGlobe.getState().setSheet(null);
  }
  function back() { setSnap(playerRef.current.prev()); }
  function next() {
    if (activeIndex === CHAPTERS.length - 1) { exit(); return; }
    setSnap(playerRef.current.next());
  }
  function togglePlay() { setSnap(playing ? playerRef.current.pause() : playerRef.current.play()); }

  function enterFilm() {
    if (open) exit();
    select(null);
    setTourStep(null);
    setFilmSnap(filmPlayerRef.current.seekChapter(0));
    useGlobe.getState().setSheet("story");
    setFilmOpen(true);
  }
  function exitFilm() {
    filmPlayerRef.current.pause();
    restoreLayers();
    setFilm(null, 1);
    setFilmOpen(false);
    if (useGlobe.getState().sheet === "story") useGlobe.getState().setSheet(null);
  }
  function filmBack() { setFilmSnap(filmPlayerRef.current.prev()); }
  function filmNext() {
    if (activeFilmIndex === FILM_CHAPTERS.length - 1) { exitFilm(); return; }
    setFilmSnap(filmPlayerRef.current.next());
  }
  function toggleFilmPlay() { setFilmSnap(filmPlaying ? filmPlayerRef.current.pause() : filmPlayerRef.current.play()); }
  // seek() clamps to the player's own duration, so a value past the end
  // (finite, so the player's own guard accepts it) always lands exactly on
  // the last frame of the last chapter -- one line, no need to read
  // `snap.duration` out first just to hand it straight back in.
  function skipToEnd() { setFilmSnap(filmPlayerRef.current.seek(Number.MAX_SAFE_INTEGER)); }

  // Entry icons share the measured topbar, never the fact band or sheet.
  const storyFabBusy = busy || filmOpen;
  const filmFabBusy = busy || open;
  const compact = getComputedStyle(document.documentElement).getPropertyValue("--globe-compact").trim() === "1";
  const sheetOpen = (sheet !== null && (compact || sheet !== "story")) || tourStep !== null;
  const entryHost = document.querySelector("[data-globe-topbar] > div:last-child");
  const compactFabs = entryHost && createPortal(
    <>
      {!open && !sheetOpen && (
        <button
          type="button"
          data-story-entry-compact
          onClick={enter}
          aria-label="My story"
          title="My story"
          className={`pointer-events-auto relative z-20 h-11 w-11 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${storyFabBusy ? "flex" : "hidden compact:flex"}`}
        >
          <BookOpen size={16} aria-hidden />
        </button>
      )}
      {!filmOpen && !sheetOpen && (
        <button
          type="button"
          data-film-entry-compact
          onClick={enterFilm}
          aria-label="Life journey film"
          title="Life journey film"
          className={`pointer-events-auto relative z-20 h-11 w-11 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${filmFabBusy ? "flex" : "hidden compact:flex"}`}
        >
          <Clapperboard size={16} aria-hidden />
        </button>
      )}
    </>, entryHost
  );

  if (open) {
    const cardBody = (touchTarget: string) => (
      <>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-100">{event.title}</h2>
          <button type="button" onClick={exit} aria-label="Exit my story" className={`shrink-0 ${btn} ${touchTarget}`}>
            Exit
          </button>
        </div>
        <p className="mb-1 text-xs text-muted" title={event.dateNote}>{formatEventDate(event)}</p>
        <p className="mb-2 text-xs leading-relaxed text-zinc-300">{event.detail}</p>
        {event.metric && (
          <p className="mb-2 text-xs text-zinc-400" title={event.metric.source}>
            {event.metric.value} {event.metric.unit}
          </p>
        )}
        <p className="mb-3 truncate text-xs text-muted" title={event.source}>evidence: {event.source}</p>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5" aria-hidden>
          {CHAPTERS.map((c, i) => (
            <span key={c.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i === activeIndex ? "var(--color-signal)" : "#3f3f46" }} />
          ))}
        </div>
        <div className="sticky bottom-0 -mx-3 -mb-3 flex items-center justify-between gap-2 rounded-b-2xl glass-panel px-3 pb-3 pt-2">
          <button type="button" onClick={back} disabled={activeIndex === 0} className={`${btn} disabled:opacity-30 ${touchTarget}`}>
            Back
          </button>
          {!reducedMotion && (
            <button type="button" onClick={togglePlay} aria-pressed={playing} aria-label={playing ? "Pause the story" : "Play the story"} className={`${btn} ${touchTarget}`}>
              {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
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
          className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] overflow-y-auto rounded-2xl glass-panel p-3 font-mono text-xs text-zinc-300 sm:top-[var(--globe-left-slot-top,5rem)] sm:block sm:inset-x-auto sm:left-4 sm:bottom-[var(--globe-facts-reserve,calc(45%+16px))] sm:max-h-[calc(100%-var(--globe-facts-reserve,calc(45%+16px))-var(--globe-left-slot-top,5rem))]"
        >
          {cardBody("py-1")}
        </div>

        {/* Compact viewports share globeStore's exclusive sheet. */}
        <div
          data-story-chapter-sheet
          data-story-chapter-id={chapter.id}
          role="dialog"
          aria-label="My story"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl glass-panel p-4 font-mono text-xs text-zinc-300 compact:!block sm:hidden"
        >
          {cardBody("min-h-11 min-w-11")}
        </div>
        {compactFabs}
      </>
    );
  }

  if (filmOpen) {
    const filmCardBody = (touchTarget: string) => (
      <>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-100">{filmChapter.title}</h2>
          <button type="button" onClick={exitFilm} aria-label="Exit the life journey film" className={`shrink-0 ${btn} ${touchTarget}`}>
            Exit
          </button>
        </div>
        <p className="mb-1 text-xs text-muted" title={filmEvent.dateNote}>{formatEventDate(filmEvent)}</p>
        <p className="mb-2 text-xs leading-relaxed text-zinc-300">{filmEvent.detail}</p>
        {filmChapter.mapsLine && (
          <p className="mb-1 text-xs text-zinc-400" title="src/data/generated/mapsPlaces.ts">{filmChapter.mapsLine}</p>
        )}
        {/* Remounts per chapter (key) so .fade-in (src/index.css) replays
            for the new city instead of firing once and staying spent. */}
        <StoryFilmstrip key={filmChapter.id} photos={filmChapter.photos} reducedMotion={reducedMotion} />
        <p className="mb-3 mt-2 truncate text-xs text-muted" title={filmEvent.source}>evidence: {filmEvent.source}</p>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5" aria-hidden>
          {FILM_CHAPTERS.map((c, i) => (
            <span key={c.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i === activeFilmIndex ? "var(--color-signal)" : "#3f3f46" }} />
          ))}
        </div>
        <div className="sticky bottom-0 -mx-3 -mb-3 flex items-center justify-between gap-1 rounded-b-2xl glass-panel px-3 pb-3 pt-2">
          <button type="button" onClick={filmBack} disabled={activeFilmIndex === 0} className={`${btn} disabled:opacity-30 ${touchTarget}`}>
            Back
          </button>
          {/* Unlike "My story", the film's own Play/Pause stays even under
              reduced motion -- it is the film's transport control, not the
              flight; CameraDirector already turns the flight itself into a
              cut, and StoryArc.tsx already draws the arc fully formed
              instead of animating it, so nothing here still moves. */}
          <button type="button" onClick={toggleFilmPlay} aria-pressed={filmPlaying} aria-label={filmPlaying ? "Pause the film" : "Play the film"} className={`${btn} ${touchTarget}`}>
            {filmPlaying ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
          <button type="button" onClick={skipToEnd} aria-label="Skip to the end" title="Skip to the end" className={`${btn} ${touchTarget}`}>
            <SkipForward size={16} aria-hidden />
          </button>
          <span className="text-xs text-muted">{activeFilmIndex + 1} / {FILM_CHAPTERS.length}</span>
          <button type="button" onClick={filmNext} className={`${btn} ${touchTarget}`}>
            {activeFilmIndex === FILM_CHAPTERS.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </>
    );

    return (
      <>
        <div
          data-film-chapter-card
          data-film-chapter-id={filmChapter.id}
          role="dialog"
          aria-label="Life journey film"
          className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] overflow-y-auto rounded-2xl glass-panel p-3 font-mono text-xs text-zinc-300 sm:top-[var(--globe-left-slot-top,5rem)] sm:block sm:inset-x-auto sm:left-4 sm:bottom-[var(--globe-facts-reserve,calc(45%+16px))] sm:max-h-[calc(100%-var(--globe-facts-reserve,calc(45%+16px))-var(--globe-left-slot-top,5rem))]"
        >
          {filmCardBody("py-1")}
        </div>
        <div
          data-film-chapter-sheet
          data-film-chapter-id={filmChapter.id}
          role="dialog"
          aria-label="Life journey film"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl glass-panel p-4 font-mono text-xs text-zinc-300 compact:!block sm:hidden"
        >
          {filmCardBody("min-h-11 min-w-11")}
        </div>
        {compactFabs}
      </>
    );
  }

  return (
    <>
      {/* Desktop/tablet, left column free: both entry pills stacked in the
          shared slot Inspector/GlobeTour's card also use -- safe only
          because neither renders anything there while !busy, and the column
          layout means a future third pill needs no new offset math. */}
      {!busy && (
        <div className="absolute left-4 top-20 z-30 hidden flex-col items-start gap-2 sm:top-[var(--globe-left-slot-top,5rem)] sm:flex">
          <button type="button" data-story-entry onClick={enter} className={pill}>
            <BookOpen size={16} aria-hidden /> My story
          </button>
          <button type="button" data-film-entry onClick={enterFilm} className={pill}>
            <Clapperboard size={16} aria-hidden /> Life journey film
          </button>
        </div>
      )}
      {/* Compact fallback: phones always (there is no spare column there),
          and desktop whenever the left slot is busy (a selection, the
          guided tour, or the other player already showing there). Fixed to
          the viewport, not the stage, so it floats free of both; stacked
          one above the other so neither ever overlaps the other. */}
      {compactFabs}
    </>
  );
}
