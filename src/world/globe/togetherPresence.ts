// LANE W15: the one file bridging together.ts's pure privacy rules to
// playhtml's real presence channel. Not vitest-testable on purpose --
// `@playhtml/react` reads `document` at module load, fatal under vitest's
// `environment: "node"` (src/test/mocks/playhtml-react.ts's own comment
// names the identical trap for Ghosts.tsx). Every rule this file wires up
// already has a pure unit test in together.test.ts; Playwright
// (e2e/globe-W15.spec.ts) covers the render path via the seam below.
import { usePresence } from "@playhtml/react";
import { selectOthers, TOGETHER_CHANNEL, type RawViewEntry, type ViewPresence } from "./together.ts";

/**
 * e2e-only seams (G10: a required gate never hits a live network), the same
 * shape and reasoning as presenceGeo.ts's own `__GLOBE_PRESENCE_TEST__`: a
 * real playhtml room's actual occupancy during a test run is nobody's
 * business and never deterministic, so e2e/globe-W15.spec.ts sets
 * `__GLOBE_TOGETHER_TEST__` before navigating and every "other explorer"
 * TogetherLayer draws is exactly what was injected, nothing else. Both are
 * left undefined in production. `__GLOBE_TOGETHER_SET_SHARING__` stands in
 * for the sharing toggle the UI lane still owns (LayerPanel.tsx's own
 * `__GLOBE_TEST_SET_ENTITY__` makes the identical trade for a lane it
 * doesn't want this worktree to depend on).
 */
declare global {
  interface Window {
    __GLOBE_TOGETHER_TEST__?: Record<string, RawViewEntry>;
    __GLOBE_TOGETHER_SET_SHARING__?: (sharing: boolean) => void;
  }
}

export interface TogetherPresence {
  /** Others' current view states, self excluded, capped at MAX_RENDERED. */
  rendered: [string, ViewPresence][];
  /** The full live count, uncapped -- what store.together.count and the
   *  "N exploring with you" line read from. */
  total: number;
  /** Publishes THIS tab's own view state on the same channel. Always the
   *  real `setMyPresence` -- only the READ side above honours the test
   *  seam, exactly like presenceGeo.ts's own `usePresenceGeo` still calls
   *  the real `setMyPresence` under an injected override: an ephemeral
   *  write to a room nothing here ever reads back from during a test run
   *  is harmless, and TogetherLayer's own dataset counter (not this
   *  function) is the thing e2e actually spies on. */
  publish: (view: ViewPresence) => void;
}

/** Subscribes to `globe-view-v1` and hands back the same `setMyPresence`
 *  this tab publishes its own view through -- one channel, one hook, the
 *  identical bus-reuse reasoning Ghosts.tsx's own GHOST_CHANNEL comment
 *  already gives for a second caller costing no second connection. */
export function useTogetherPresence(): TogetherPresence {
  const { presences, setMyPresence } = usePresence<ViewPresence>(TOGETHER_CHANNEL);
  const testOverride = typeof window !== "undefined" ? window.__GLOBE_TOGETHER_TEST__ : undefined;
  const { rendered, total } = testOverride ? selectOthers(Object.entries(testOverride)) : selectOthers(presences.entries());
  return { rendered, total, publish: setMyPresence };
}
