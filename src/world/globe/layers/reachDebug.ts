// LANE W6: the e2e seam for this lane's four features, all in ONE plain
// window global -- HazardLayer.tsx's own precedent for a LAZY layer (a
// hidden `<Html>` probe on a lazily-loaded layer measurably regressed the
// "Globe" chunk's own budget there, folding an unrelated shared chunk into
// the eager bundle; see that file's comment). ReachLayer.tsx is lazy too,
// so this follows the same fix rather than reintroducing that regression.
//
// Each of this lane's own render files owns a slice of the object;
// `ensureReachDebug` lazily creates it on first touch so mount order
// between them never matters.
import type { LayerHealth } from "../globeStore.ts";

export interface ReachDebug {
  appCount: number;
  /** The first (biggest-install) app column's current screen projection --
   *  e2e/globe-W6.spec.ts clicks here to prove the column-click wire. */
  appProbeX: number | null;
  appProbeY: number | null;
  ciSegments: { slug: string; status: string }[];
  spotifyPlaying: boolean;
  lichessOnline: boolean;
  status: LayerHealth;
}

declare global {
  interface Window {
    __REACH_DEBUG__?: ReachDebug;
  }
}

const DEFAULTS: ReachDebug = {
  appCount: 0,
  appProbeX: null,
  appProbeY: null,
  ciSegments: [],
  spotifyPlaying: false,
  lichessOnline: false,
  status: { state: "loading" },
};

export function ensureReachDebug(): ReachDebug {
  if (typeof window === "undefined") return DEFAULTS;
  if (!window.__REACH_DEBUG__) window.__REACH_DEBUG__ = { ...DEFAULTS };
  return window.__REACH_DEBUG__;
}
