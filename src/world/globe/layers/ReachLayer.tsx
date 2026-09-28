/** WAVE 3 LANE W6 (the owner's own data on the globe: per-app reach, CI
 *  family ring, now playing, lichess) owns this file.
 *
 * The integration point: owns every fetch and the one composite "reach"
 * health line (same shape as HazardLayer.tsx's own integration role) --
 * reachAppRing.tsx, familyCiRing.tsx and reachGlyphs.tsx are dumb renderers
 * over the view-models this file computes from reachApps.ts/familyCi.ts/
 * reachPresence.ts's pure logic.
 *
 * useSignals() and the bare useLiveSignal("/api/spotify") call are the SAME
 * hook/URL src/lib/useLive.ts, SiteFooter.tsx, AnomalyRail.tsx, Terminal.tsx
 * and others already call -- P4's shared bus dedupes automatically, so this
 * lane costs zero extra fetches on any page already polling either one.
 */
import { useEffect, useMemo } from "react";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { useSignals } from "../../../lib/useLive.ts";
import { useGlobe } from "../globeStore.ts";
import { fleet } from "../../../data/store.ts";
import { ciPassSummary } from "./familyCi.ts";
import { spotifyGlyph, lichessGlyph } from "./reachPresence.ts";
import { buildReachStatus } from "./reachStatus.ts";
import { ensureReachDebug } from "./reachDebug.ts";
import { ReachAppRing } from "./reachAppRing.tsx";
import { FamilyCiRing } from "./familyCiRing.tsx";
import { ReachGlyphs } from "./reachGlyphs.tsx";
import type { SpotifyNow } from "../../../../api/_lib/spotify-handler.ts";

export default function ReachLayer({ tier }: { tier: 1 | 2 | 3 }) {
  const setStatus = useGlobe((s) => s.setStatus);
  const { data: signals, error: signalsError } = useSignals();
  const { data: spotify } = useLiveSignal<SpotifyNow>("/api/spotify");

  const ci = signals?.ci ?? null;
  const spotifyView = useMemo(() => spotifyGlyph(spotify), [spotify]);
  const lichessView = useMemo(() => lichessGlyph(signals?.lichess ?? null), [signals]);

  // Health: honest counts, never a stale value dressed as live (globeStore's
  // own contract). The app ring is always drawable (committed store.ts
  // data), so this never reports "failed" -- only which live part is down.
  useEffect(() => {
    const status = buildReachStatus({
      appCount: fleet.length,
      ci: ciPassSummary(ci),
      ciDown: signalsError && !signals,
      nowPlaying: spotifyView !== null,
      lichessOnline: lichessView !== null,
    });
    setStatus("reach", status);
    const dbg = ensureReachDebug();
    dbg.status = status;
    dbg.spotifyPlaying = spotifyView !== null;
    dbg.lichessOnline = lichessView !== null;
  }, [ci, signals, signalsError, spotifyView, lichessView, setStatus]);

  return (
    <>
      <ReachAppRing interactive={tier !== 3} />
      {tier !== 3 && <FamilyCiRing ci={ci} animate={tier === 1} />}
      {tier === 1 && <ReachGlyphs spotify={spotifyView} lichess={lichessView} />}
    </>
  );
}
