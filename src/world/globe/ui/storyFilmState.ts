import { create } from "zustand";
import type { FilmChapter } from "../story/storyFilm.ts";

/** The one thing the film half of ui/StoryPlayer.tsx (writer) and
 *  layers/StoryArc.tsx (reader) share: which film chapter is active and how
 *  far its own incoming arc should be drawn. Mirrors storyChapterState.ts's
 *  own reasoning (the two mount in different trees with no shared parent
 *  this lane may edit) but is its own store rather than a new field on that
 *  file -- this lane doesn't own storyChapterState.ts, and "My story" and
 *  the film must never fight over one shared `chapter` field mid-transition
 *  (both can't be open at once, but a stale value from one must not leak
 *  into the other). `chapter: null` means the film is closed or paused with
 *  nothing shown yet -- StoryArc then falls back to storyChapterState.ts's
 *  own chapter, same as before this lane existed. */
interface StoryFilmState {
  chapter: FilmChapter | null;
  /** 0 at the start of this chapter's dwell, 1 once fully "arrived" --
   *  StoryArc.tsx grows the incoming arc from this rather than drawing it
   *  fully formed the instant the chapter becomes active. */
  progress: number;
  setFilm: (chapter: FilmChapter | null, progress: number) => void;
}

export const useStoryFilmState = create<StoryFilmState>((set) => ({
  chapter: null,
  progress: 1,
  setFilm: (chapter, progress) => set({ chapter, progress }),
}));
