import { create } from "zustand";
import type { StoryChapter } from "../story/index.ts";

/** The one thing ui/StoryPlayer.tsx (writer) and layers/StoryArc.tsx (reader)
 *  share: which chapter, if any, the story is currently showing. A tiny
 *  dedicated store rather than a prop (the two mount in different trees --
 *  Globe.tsx and GlobeScene.tsx -- with no shared parent that isn't owned by
 *  another lane) and rather than a new field on globeStore.ts (shared by
 *  every other wave-6 lane in parallel; this file's name is one only this
 *  lane created). `null` means the story is closed or paused-with-nothing-
 *  shown-yet -- StoryArc draws nothing then, same as GlobeTour's own
 *  "nothing to show" null. */
interface StoryChapterState {
  chapter: StoryChapter | null;
  setChapter: (chapter: StoryChapter | null) => void;
}

export const useStoryChapterState = create<StoryChapterState>((set) => ({
  chapter: null,
  setChapter: (chapter) => set({ chapter }),
}));
