import { useMemo } from "react";
import { useSky } from "../../../lib/useSky.ts";
import { useGlobe } from "../globeStore.ts";
import { hazardsSummary, loadedImageryHeadline, loadedImagerySummary, liveLayersSummary, selectionAnnouncement, selectionSummary, skySummary, sceneReceiptRows, imageryObservationAge } from "./sceneSummaryText.ts";
import SceneReceipt from "./sceneReceipt.tsx";

/** One lazy surface, with the same pure sentences for visual and nonvisual
 * visitors. The shared sky clock supplies real observation age; simulated
 * time only determines which nowcast layers are hidden. */
export default function SceneSummary() {
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const imagery = useGlobe((s) => s.imagery);
  const style = useGlobe((s) => s.style);
  const offset = useGlobe((s) => s.timeOffsetMin);
  const selected = useGlobe((s) => s.selected);
  const sky = useSky();
  const imageryText = loadedImagerySummary(style, status.earth);
  const rows = useMemo(() => sceneReceiptRows(layers, status, imagery, style, offset), [layers, status, imagery, style, offset]);
  const age = style === "imagery" && (status.earth?.state === "live" || status.earth?.state === "snapshot")
    ? imageryObservationAge(status.earth.detail, sky?.now ?? null) : "";
  const announcement = selectionAnnouncement(selected);

  return <>
    <SceneReceipt headline={loadedImageryHeadline(style, status.earth)} imageryText={imageryText} age={age} rows={rows} />
    <section data-scene-summary aria-label="Scene summary" className="sr-only">
      <h3>Imagery</h3><p>{imageryText} {age}</p>
      <h3>Live layers</h3><p>{liveLayersSummary(layers, status)}</p>
      <h3>Hazards</h3><p>{hazardsSummary(status.hazards)}</p>
      <h3>Sky</h3><p>{skySummary(sky)}</p>
      <h3>Selection</h3><p>{selectionSummary(selected)}</p>
    </section>
    <div data-scene-summary-live aria-live="polite" className="sr-only">{announcement}</div>
  </>;
}
