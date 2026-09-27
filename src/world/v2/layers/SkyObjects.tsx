/**
 * Sky objects (master-plan.md#P3-03: aircraft silhouettes and trails,
 * satellites, the Survey lens, pick). The one file this lane adds to the
 * `layers/*.tsx` glob (`layers.ts`'s own contract; WorldV2.tsx never edited
 * to mount it), so it is the umbrella for everything else this lane owns
 * under `reality/`: `Aircraft` always mounts, `Satellites` mounts only
 * while the Survey lens is open (M56's own "lazy import"; mounting is what
 * gates `useSatellites()`'s internal `import("./satellites.ts")`), and
 * `SurveyLensKeyListener` installs the single `L`-key toggle for the whole
 * world.
 */
import Aircraft from "../reality/Aircraft.tsx";
import Satellites from "../reality/Satellites.tsx";
import { SurveyLensKeyListener, useSurveyLens } from "../reality/SurveyLens.tsx";

export const layer = { id: "sky-objects", order: 60 };

export default function SkyObjects() {
  const lensOpen = useSurveyLens();
  return (
    <>
      <SurveyLensKeyListener />
      <Aircraft />
      {lensOpen && <Satellites />}
    </>
  );
}
