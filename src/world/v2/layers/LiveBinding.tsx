/** Mirrors live readings onto the canvas for the ledger and browser checks.
 * WorldV2 owns sky lighting so the dome and environment share one reading,
 * including the time preview. Live values never change grammar counts.
 */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useNowModel } from "../useNowModel.ts";
import { ledger } from "../ledger.ts";
import { deviceTier } from "../../deviceTier.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { rainMode } from "../../Rain.tsx";
import { siteCiGlow } from "../../realityRows.ts";
import {
  rainBinding,
  chessLampBinding,
  collarState,
  keystoneLampLit,
  kiteAltitudeBinding,
  KITE_FLOOR_M,
} from "../live/liveBinding.ts";

export const layer = { id: "live-binding", order: 5 };

// The three stream-collar repos with a real, public CI (row 18) — Candidai
// and kmp-app-template stay "unmeasured" by construction (they carry no
// entry in `SignalsResponse["ci"]` at all).
const COLLAR_REPOS = ["doori", "gaddi", "paymentslab-kmp"] as const;

/** `field -> string`, mirrored onto the actual `<canvas>` DOM element — the
 *  same idiom `LandmarksApps.tsx` (P3-01a) already uses, so no second DOM
 *  node is needed for e2e to read this lane's rows. */
function useCanvasDataAttrs(attrs: Readonly<Record<string, string>>): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(`data-${k}`, v);
  }, [gl, attrs]);
}

export default function LiveBinding() {
  const nowModel = useNowModel(null);
  const reducedMotion = useReducedMotion();
  const tier = deviceTier();

  const sky = nowModel?.raw.sky ?? null;
  const weather = sky?.weather ?? null;
  const signals = nowModel?.raw.signals ?? null;

  // ── Rows 5/16/18/19 + row 17's summary: data-live-* on the canvas ────────
  const rain = rainBinding(weather?.precipMmH ?? null, tier);
  const mode = rainMode(weather?.precipMmH ?? 0, reducedMotion, tier);
  const chessLamp = chessLampBinding(signals?.lichess ?? null);
  const keystoneLit = keystoneLampLit(signals?.ci ?? null);
  // Row 20: the site's own two workflows (M2) — the SAME classifier the v1
  // ledger/Monuments.tsx already use, so the twin-chhatri inlay can never
  // disagree with what "the portfolio's own CI" means elsewhere on the site.
  const opsLit = siteCiGlow(nowModel?.raw.ops ?? null) === "ok";

  const kiteAltitudes = ledger.writing.lessons.map((l) => kiteAltitudeBinding(signals?.devto ?? null, l.links.devto ?? null).altitudeM);
  const kiteMin = kiteAltitudes.length > 0 ? Math.min(...kiteAltitudes) : KITE_FLOOR_M;
  const kiteMax = kiteAltitudes.length > 0 ? Math.max(...kiteAltitudes) : KITE_FLOOR_M;

  useCanvasDataAttrs(
    useMemo(
      () => ({
        "live-rain-count": String(rain.count),
        "live-rain": mode,
        "live-chess-lamp": String(chessLamp),
        "live-keystone": keystoneLit ? "lit" : "unlit",
        "live-twin-chhatri": opsLit ? "lit" : "unlit",
        "live-kite-min-altitude": String(kiteMin),
        "live-kite-max-altitude": String(kiteMax),
        ...Object.fromEntries(COLLAR_REPOS.map((slug) => [`live-collar-${slug}`, collarState(slug, signals?.ci ?? null)])),
      }),
      [rain.count, mode, chessLamp, keystoneLit, opsLit, kiteMin, kiteMax, signals],
    ),
  );

  return null;
}
