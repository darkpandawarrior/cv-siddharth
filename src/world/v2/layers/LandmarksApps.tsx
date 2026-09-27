/**
 * The landmarks-apps canvas layer (P3-01a's own task list, world-v2-spec.md
 * #5 rows 1-9): mounts the keystone bridge, Doori/Gaddi ghats, the
 * PaymentsLab-KMP bell toran, Candidai rahat, the template gomukh, the portfolio twin
 * chhatri, Stutter's yantra and the SINC-P baori at their layout position,
 * bound to real counts through `../landmarkBindings.ts`.
 *
 * Registered through `layers.ts`'s zero-props glob (`export const layer`),
 * so - like every other canvas layer - it builds its OWN `WorldModel` from
 * the same shared hooks `WorldV2.tsx` uses (`useNowModel`/`ledger`/
 * `useTouched`): those are `useSyncExternalStore` buses keyed by URL/module
 * scope, so a second caller costs no second fetch and no second clock
 * (useNowModel.ts's own doc comment, M53).
 */
import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { useNavigate } from "@tanstack/react-router";
import { ledger } from "../ledger.ts";
import { worldModel } from "../worldModel.ts";
import type { DetailLink, You } from "../worldModel.ts";
import { useNowModel } from "../useNowModel.ts";
import { useReveal } from "../reveal.ts";
import { sangamBasin, districtAnchors } from "../valley.ts";
import { touch, useTouched } from "../../../lib/sessionRipple.ts";
import { prefersReducedMotion } from "../../reducedMotion.ts";
import {
  BAORI_GATE_IDS,
  BAORI_LEVELS,
  GOMUKH_SPOUTS,
  LANDMARK_OPENS,
  RAHAT_BUCKETS,
  baoriInnermostReady,
  bellTotal,
  bellToranBinding,
  bridgeBinding,
  dooriBinding,
  gaddiBinding,
  twinChhatriBinding,
  yantraBinding,
} from "../landmarkBindings.ts";
import {
  CandidaiRahatKit,
  DooriGhatKit,
  GaddiGhatKit,
  KeystoneBridgeKit,
  PaymentslabBellToranKit,
  PortfolioTwinChhatriKit,
  SincPBaoriKit,
  StutterSamratYantraKit,
  TemplateGomukhKit,
  type Vec3,
} from "../kits/architecture.ts";

export const layer = { id: "landmarks-apps", order: 30 };

// world-v2-spec.md #2.1: the districts sit on the basin's own amphitheatre
// arc. Placing all eight non-bridge landmarks through ONE `districtAnchors`
// call spreads them evenly with no overlap; only doori/gaddi/paymentslab-kmp/
// candidai/kmp-app-template are real `includeBuild` tributary sources
// (valley.ts's own `tributarySourceIds`) - portfolio/stutter/sinc-p have no
// stream of their own here, so their exact west-terrace PROJECT_DATE
// placement (world-v2-spec's ASCII layout) is a visual-polish item this
// lane leaves for a follow-up rather than re-deriving a second anchor
// scheme; the arc position below is honest layout, just not spec-exact.
const DISTRICT_IDS = ["doori", "gaddi", "paymentslab-kmp", "candidai", "kmp-app-template", "portfolio", "stutter", "sinc-p"] as const;

function useLandmarkPositions(): Readonly<Record<string, Vec3>> {
  return useMemo(() => {
    const basin = sangamBasin();
    const anchors = districtAnchors([...DISTRICT_IDS], basin);
    const byId: Record<string, Vec3> = { bridge: [basin.x, 0, basin.z - basin.r - 6] };
    for (const a of anchors) byId[a.id] = [a.x, a.y, a.z];
    return byId;
  }, []);
}

function openLink(navigate: ReturnType<typeof useNavigate>, link: DetailLink | undefined) {
  if (!link) return;
  if (link.kind === "project") navigate({ to: "/project/$slug", params: { slug: link.target } });
  else if (link.kind === "home-anchor") navigate({ to: "/", hash: link.target });
  else navigate({ to: link.target });
}

/** `field -> string value`, written onto the actual `<canvas>` DOM element
 *  (this lane's own acceptance line: "mirrored to data-* attributes on the
 *  canvas wrapper for tests") - the same element
 *  `page.locator("[data-world='v2'] canvas")` already targets in every
 *  sibling world-v2 e2e spec, so no second DOM node is needed for tests to
 *  find these. */
function useCanvasDataAttrs(attrs: Readonly<Record<string, string>>): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(`data-${k}`, v);
  }, [gl, attrs]);
}

export default function LandmarksApps() {
  const navigate = useNavigate();
  const positions = useLandmarkPositions();
  const reducedMotion = prefersReducedMotion();
  const touched = useTouched();
  const nowModel = useNowModel(null);

  const you: You = useMemo(
    () => ({ touched, lastSeen: null, tier: 1, reducedMotion }),
    [touched, reducedMotion],
  );
  const wm = useMemo(() => (nowModel ? worldModel(ledger, nowModel.now, you) : null), [nowModel, you]);
  const features = wm?.features ?? [];

  const bridge = bridgeBinding(features);
  const doori = dooriBinding(features);
  const gaddi = gaddiBinding(features);
  const bells = bellToranBinding(features);
  const twinChhatri = twinChhatriBinding(features);
  const sun = nowModel?.raw.sky?.sun ?? null;
  const yantra = yantraBinding(sun?.azimuthDeg ?? 0, sun?.altitudeDeg ?? -1);
  const innermostReady = baoriInnermostReady(touched);
  const levelTouched = BAORI_LEVELS.map((l) => touched.includes(l.id));

  const [reveal, setReveal] = useState(reducedMotion ? 1 : 0);
  useReveal(true, reducedMotion, setReveal);

  useCanvasDataAttrs(
    useMemo(
      () => ({
        voussoirs: String(bridge.voussoirs),
        piers: String(bridge.piers),
        "deck-lamps": String(bridge.deckLamps),
        "doori-steps": String(doori.steps),
        "doori-pillar-bands": String(doori.pillarBands),
        "gaddi-steps": String(gaddi.steps),
        "bells-native": String(bells.native),
        "bells-hosted": String(bells.hosted),
        "bells-mobile-money": String(bells.mobileMoney),
        "bells-internal": String(bells.internal),
        "bells-stub": String(bells.stub),
        "bells-total": String(bellTotal(bells)),
        "inlay-tiles": twinChhatri.inlayTiles == null ? "unmeasured" : String(twinChhatri.inlayTiles),
        "yantra-az": yantra.azimuthDeg.toFixed(2),
        "yantra-sun-up": String(yantra.sunUp),
        "baori-innermost-ready": String(innermostReady),
      }),
      [bridge, doori, gaddi, bells, twinChhatri, yantra, innermostReady],
    ),
  );

  return (
    <group name="landmarks-apps">
      <KeystoneBridgeKit
        position={positions.bridge}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS.bridge)}
        voussoirs={bridge.voussoirs}
        piers={bridge.piers}
        deckLamps={bridge.deckLamps}
      />
      <DooriGhatKit
        position={positions.doori}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS.doori)}
        steps={doori.steps}
        pillarBands={doori.pillarBands}
      />
      <GaddiGhatKit
        position={positions.gaddi}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS.gaddi)}
        steps={gaddi.steps}
      />
      <PaymentslabBellToranKit
        position={positions["paymentslab-kmp"]}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS["paymentslab-kmp"])}
        bells={bells}
      />
      <CandidaiRahatKit
        position={positions.candidai}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS.candidai)}
        buckets={RAHAT_BUCKETS}
      />
      <TemplateGomukhKit position={positions["kmp-app-template"]} reveal={reveal} spouts={GOMUKH_SPOUTS} />
      <PortfolioTwinChhatriKit
        position={positions.portfolio}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS.portfolio)}
        inlayTiles={twinChhatri.inlayTiles}
      />
      <StutterSamratYantraKit
        position={positions.stutter}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS.stutter)}
        azimuthDeg={yantra.azimuthDeg}
        sunUp={yantra.sunUp}
      />
      <SincPBaoriKit
        position={positions["sinc-p"]}
        reveal={reveal}
        onOpen={() => openLink(navigate, LANDMARK_OPENS["sinc-p"])}
        levelTouched={levelTouched}
        innermostReady={innermostReady}
        onTouchLevel={(i) => touch(BAORI_GATE_IDS[i])}
      />
    </group>
  );
}
