import { createContext, useContext } from "react";
import type { PulseCounts, PulseEvent } from "./pulse.ts";

/**
 * How a component reads and writes the interaction counter WITHOUT importing
 * the shared layer.
 *
 * pulse.ts reaches for `usePageData` from `@playhtml/react`, which reads
 * `document` the moment it is imported. That is fine for a room that only ever
 * runs in a browser, and it was fine for every consumer here until RoomGrid
 * needed to server-render: RoomGrid is the visible page on /playground for
 * anyone without WebGL, and one import of pulse.ts through it was enough to
 * kill the whole route's SSR with `document is not defined`. The route had
 * been marked `ssr: false` ever since, which is why it painted nothing at all.
 *
 * So the counter reaches components through a context instead of an import.
 * The default value is a real, working no-op: counts are empty and a bump goes
 * nowhere. That is exactly the truth on the server and during the first client
 * render, when there is no socket and no shared document to count into.
 * LivePulse.tsx supplies the real pair once there is.
 *
 * Only the types come from pulse.ts, and `import type` is erased, so nothing
 * here puts that module back into anyone's graph.
 */
export interface PulseUI {
  counts: PulseCounts;
  bump: (event: PulseEvent) => void;
}

export const PulseContext = createContext<PulseUI>({ counts: {}, bump: () => {} });

/** The counter, as a component should ask for it. Safe anywhere, including on
 *  the server, where it reports nothing rather than failing. */
export function usePulseUI(): PulseUI {
  return useContext(PulseContext);
}
