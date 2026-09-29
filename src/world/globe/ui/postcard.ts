// LANE C1 ("Share a view"), feature 3: export the current globe view as a
// PNG postcard. `capturePostcard` is the only impure entry point (reads the
// live scene canvas, the store, the clock, and triggers a download);
// `buildStampLines` and `gatherStampInput` are pure/near-pure so the
// honesty rule ("the stamp names every data source visible in that frame")
// is testable without a WebGL context.
import { LAYER_IDS, sceneHandles, useGlobe, type LayerId, type StatusKey } from "../globeStore.ts";

/** Mirrors LayerPanel.tsx's own (unexported) LABEL record -- restated per
 *  this lane's own file-ownership boundary (LayerPanel.tsx isn't ours to
 *  edit or re-export from). Only layers that draw something a screenshot
 *  could actually show; "guide" (My Maps places, curated) and "together"
 *  (a live headcount, not a drawn feature) are still listed since both do
 *  render visible geometry. */
const LAYER_LABEL: Record<LayerId, string> = {
  buoys: "Ocean buoys",
  markers: "Pune markers",
  stars: "stars and Moon",
  satellites: "satellites",
  aircraft: "aircraft",
  presence: "visitor presence",
  pulses: "live pulses",
  hazards: "earth events",
  wind: "wind",
  reach: "reach columns",
  countries: "country boundaries",
  together: "explorers here now",
  density: "quake/fire density",
  guide: "My Maps places",
  daylight: "golden hour and waking bands (computed from the sun position)",
  eclipse: "computed solar eclipse paths",
};

export interface StampInput {
  /** Names the base earth rendering honestly: the real GIBS detail string
   *  when confirmed live, the raw layer id when set but unconfirmed, or a
   *  plain "dot-matrix" label when the dots style is showing -- never a
   *  satellite-imagery claim for a frame that isn't drawing one. */
  earthLabel: string;
  /** Human labels for every currently-on layer whose status this frame
   *  confirms is live or a snapshot -- never a layer that's merely toggled
   *  on with no confirmed data (house rule: never dress a stale/failed
   *  feed as live). */
  liveLayers: string[];
  siteUrl: string;
}

/** Pure: given the store's earth style/imagery/layers/status and the
 *  current URL, builds what the stamp is allowed to claim. Kept separate
 *  from the store read below so the honesty logic has a unit test that
 *  doesn't need a mounted store. */
export function buildStampInput(args: {
  style: "imagery" | "dots";
  imageryBase: string;
  layers: Record<LayerId, boolean>;
  status: Partial<Record<StatusKey, { state: "loading" | "live" | "snapshot" | "failed"; detail?: string }>>;
  siteUrl: string;
}): StampInput {
  const earth = args.status.earth;
  const earthLabel =
    args.style === "dots"
      ? "dot-matrix earth (not satellite imagery)"
      : earth?.state === "live" && earth.detail
        ? earth.detail
        : `${args.imageryBase.replace(/_/g, " ")} (NASA GIBS)`;

  const liveLayers = LAYER_IDS.filter((id) => args.layers[id] && ["live", "snapshot"].includes(args.status[id]?.state ?? "")).map((id) => LAYER_LABEL[id]);

  return { earthLabel, liveLayers, siteUrl: args.siteUrl };
}

/** The three lines drawn into the postcard's corner stamp, in order:
 *  earth source + date, then every other confirmed-live data source, then
 *  the site URL a viewer of the postcard (who never saw the page) can visit
 *  to see it live themselves. */
export function buildStampLines(input: StampInput): string[] {
  const lines = [input.earthLabel];
  if (input.liveLayers.length > 0) lines.push(`+ live: ${input.liveLayers.join(", ")}`);
  lines.push(input.siteUrl);
  return lines;
}

const STAMP_PAD = 12;
const STAMP_LINE_H = 15;
const STAMP_FONT = "11px ui-monospace, Menlo, monospace";

/** Draws the glass-panel stamp (site's own border-line/bg-ink/font-mono
 *  language, rendered as flat pixels since a PNG has no backdrop-filter)
 *  into the bottom-right corner of `ctx`. */
function drawStamp(ctx: CanvasRenderingContext2D, width: number, height: number, lines: string[]): void {
  ctx.font = STAMP_FONT;
  ctx.textBaseline = "top";
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = textWidth + STAMP_PAD * 2;
  const boxH = lines.length * STAMP_LINE_H + STAMP_PAD * 2 - (STAMP_LINE_H - 11);
  const x = width - boxW - 16;
  const y = height - boxH - 16;

  ctx.fillStyle = "rgba(9, 9, 11, 0.72)"; // bg-ink/70
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = "rgba(63, 63, 70, 0.9)"; // border-line
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

  ctx.fillStyle = "#e4e4e7";
  lines.forEach((line, i) => {
    ctx.fillText(line, x + STAMP_PAD, y + STAMP_PAD + i * STAMP_LINE_H);
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick, not synchronously: some browsers resolve the
  // download from the object URL asynchronously, and revoking too early has
  // been observed to drop the file (same caution as any blob-download
  // helper in this codebase's data-export paths).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Renders one on-demand frame, reads it off the live canvas via
 * `canvas.toBlob`, composites the honesty stamp onto a fresh 2D canvas, and
 * downloads the result. Deliberately never sets `preserveDrawingBuffer` on
 * the WebGL context (a session-wide cost GlobeScene.tsx's own Canvas isn't
 * ours to reconfigure, and not worth paying for an occasional export
 * anyway): `toBlob` reads whatever is in the drawing buffer at the moment
 * it's called, so calling it synchronously right after a fresh render (two
 * rAFs after `invalidate()`, which covers both "always" and "demand"
 * frameloop modes -- see SceneActivity.tsx) captures a real frame without
 * ever flipping that flag.
 *
 * Resolves to whether a file was produced -- `false` (not a thrown error)
 * when there's no live scene to capture (no WebGL canvas mounted), so a
 * caller can show an honest "nothing to export yet" rather than crash.
 */
export function capturePostcard(): Promise<boolean> {
  const canvas = sceneHandles.canvas;
  const invalidate = sceneHandles.invalidate;
  if (!canvas) return Promise.resolve(false);

  invalidate?.();
  return new Promise<boolean>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        canvas.toBlob((sceneBlob) => {
          if (!sceneBlob) {
            resolve(false);
            return;
          }
          void compositePostcard(sceneBlob, canvas.width, canvas.height).then(() => resolve(true));
        }, "image/png");
      });
    });
  });
}

async function compositePostcard(sceneBlob: Blob, width: number, height: number): Promise<void> {
  const bitmap = await createImageBitmap(sceneBlob);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return; // no 2D context available (never expected off a real canvas) -- fail quietly, nothing to download
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const s = useGlobe.getState();
  const input = buildStampInput({
    style: s.style,
    imageryBase: s.imagery.base,
    layers: s.layers,
    status: s.status,
    siteUrl: `${location.origin}${location.pathname}`,
  });
  drawStamp(ctx, width, height, buildStampLines(input));

  const finalBlob: Blob | null = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
  if (!finalBlob) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  triggerDownload(finalBlob, `siddharth-globe-${stamp}.png`);
}
