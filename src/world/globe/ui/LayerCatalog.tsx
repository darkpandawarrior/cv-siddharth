import { useId } from "react";
import { useNow } from "../../../lib/useSky.ts";
import { Legend } from "./Legend.tsx";
import { GIBS_BASES, GIBS_OVERLAYS, catalogDateLabel, catalogDate, type GibsCatalogEntry } from "../layers/gibsCatalog.ts";
import { simTime, useGlobe, type ImageryStack, type StatusKey, type LayerHealth } from "../globeStore.ts";

const DEFAULT_OVERLAY_OPACITY = 0.75;
const GAP_8 = "gap-2";
const PAD_14 = "p-3.5";
const SPACE_8 = "space-y-2";
const MB_13 = "mb-2";
const MB_21 = "mb-4";

function isOverlayActive(imagery: ImageryStack, id: string): boolean {
  return imagery.overlays.some((o) => o.id === id);
}

function overlayOpacity(imagery: ImageryStack, id: string): number {
  return imagery.overlays.find((o) => o.id === id)?.opacity ?? DEFAULT_OVERLAY_OPACITY;
}

function FrameDetails({ entry, health, now, realNow }: { entry: GibsCatalogEntry; health?: LayerHealth; now: Date; realNow: Date }) {
  // Only a settled tile generation supplies a frame. A requested date is not
  // evidence that the data loaded, and a step-back must report its older date.
  const frame = health?.state === "live" ? health.detail : undefined;
  const ageHours = frame ? Math.max(0, Math.floor((realNow.getTime() - Date.parse(frame)) / 3_600_000)) : 0;
  return <>
    <p className="break-words text-xs font-mono text-muted">{entry.attribution}{entry.legend ? ` · ${entry.legend.unit}` : ""}</p>
    {health?.state === "failed" ? (
      <p role="status" className="mt-1 break-words text-xs font-mono text-warn">{health.detail ?? "feed unavailable"}</p>
    ) : health?.state === "live" ? (
      <>
        <p className="mt-1 break-words text-xs font-mono text-muted">
          {frame ? `${entry.dateRule.kind === "daily" ? "Daily frame" : "Frame"} ${frame.replace("T", " ").replace("Z", "")} UTC · ${ageHours} h since frame${entry.dateRule.kind === "daily" ? " date" : ""}` : "Static imagery"}
        </p>
        {entry.snowLegend && <p className="mt-2 text-xs">Rain</p>}
        {entry.legend && <Legend legend={entry.legend} />}
        {entry.snowLegend && <><p className="mt-2 text-xs">Snow</p><Legend legend={entry.snowLegend} /></>}
      </>
    ) : <p role="status" className="mt-1 text-xs text-muted">Tiles not loaded · requested {catalogDate(entry, now) ?? "static imagery"}</p>}
  </>;
}

export default function LayerCatalog() {
  const controlId = useId();
  const imagery = useGlobe((s) => s.imagery);
  const style = useGlobe((s) => s.style);
  const setImagery = useGlobe((s) => s.setImagery);
  const timeOffsetMin = useGlobe((s) => s.timeOffsetMin);
  // LANE V1 (wave 7, step A): TileLayer.tsx reports a subdaily overlay's own
  // feed health here, keyed by its GIBS layer id — not one of globeStore.ts's
  // fixed LayerId union (this is a role INSIDE the imagery stack, not a
  // top-level toggle), but `status` is a plain string-keyed record at
  // runtime, and reusing it is the existing "report failed, draw nothing,
  // never a stale value as live" convention rather than a second bespoke
  // reactive channel for the same idea. See TileLayer.tsx's own comment
  // where it writes this same key.
  const status = useGlobe((s) => s.status);
  const realNow = useNow();
  const now = simTime(timeOffsetMin, realNow?.getTime() ?? 0);

  const activeBase = GIBS_BASES.find((b) => b.id === imagery.base) ?? GIBS_BASES[0];

  function selectBase(id: string): void {
    setImagery({ ...imagery, base: id });
  }

  function toggleOverlay(id: string): void {
    const overlays = isOverlayActive(imagery, id) ? imagery.overlays.filter((o) => o.id !== id) : [...imagery.overlays, { id, opacity: DEFAULT_OVERLAY_OPACITY }];
    setImagery({ ...imagery, overlays });
  }

  function setOpacity(id: string, opacity: number): void {
    setImagery({ ...imagery, overlays: imagery.overlays.map((o) => (o.id === id ? { ...o, opacity } : o)) });
  }

  if (!realNow) return null;

  return (
    <div data-globe-layer-catalog className="w-full rounded-lg bg-ink p-2 font-body text-sm text-zinc-300">
      <section className={MB_21} aria-label="Active imagery">
        <p className="break-words text-xs font-mono text-muted">{activeBase.title}: {activeBase.dateRule.kind === "static" ? "Static imagery · " : ""}{catalogDateLabel(activeBase, now)}</p>
        {imagery.overlays.map((overlay) => {
          const entry = GIBS_OVERLAYS.find((candidate) => candidate.id === overlay.id);
          return entry ? <div key={entry.id} data-globe-active-overlay={entry.id} className="mt-3">
            <p className="break-words">{entry.title}</p>
            <p className="mb-2 break-words text-xs text-muted">{entry.description}</p>
            <FrameDetails entry={entry} health={style === "dots" || status.earth?.state === "failed" ? { state: "failed", detail: "Imagery unavailable; showing dots" } : status[entry.id as StatusKey]} now={now} realNow={realNow} />
          </div> : null;
        })}
      </section>
      <section className={MB_21}>
        <h4 className={`${MB_13} text-sm font-semibold text-muted`}>Base imagery</h4>
        <div className={`flex flex-col ${SPACE_8}`} role="radiogroup" aria-label="Base imagery layer">
          {GIBS_BASES.map((entry) => {
            const active = entry.id === imagery.base;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectBase(entry.id)}
                title={entry.description.replaceAll("—", ",")}
                className={`min-h-11 min-w-11 rounded-lg border px-2 py-1.5 text-left leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "border-accent/60 bg-accent/20 text-accent" : "border-line text-zinc-300 hover:bg-white/5"
                }`}
              >
                <div className="break-words">{entry.title}</div>
                <div className="mt-1 break-words text-xs font-mono text-muted">{entry.dateRule.kind === "static" ? "Static imagery · " : ""}{catalogDateLabel(entry, now)}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h4 className={`${MB_13} text-sm font-semibold text-muted`}>Overlays</h4>
        <ul className={SPACE_8}>
          {GIBS_OVERLAYS.map((entry) => {
            const active = isOverlayActive(imagery, entry.id);
            const opacity = overlayOpacity(imagery, entry.id);
            const inputId = `${controlId}-opacity-${entry.id}`;
            return (
              <li key={entry.id} className={`rounded-lg border border-line ${PAD_14} ${GAP_8}`}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleOverlay(entry.id)}
                  title={entry.description.replaceAll("—", ",")}
                  className="flex min-h-11 min-w-11 w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className={`min-w-0 break-words ${active ? "text-zinc-100" : "text-zinc-400"}`}>{entry.title}</span>
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[var(--color-signal)]" : "bg-zinc-700"}`} />
                </button>

                {active && (
                  <div className="mt-2">
                    <label htmlFor={inputId} className="sr-only">
                      {entry.title} opacity
                    </label>
                    <input
                      id={inputId}
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={opacity}
                      onChange={(e) => setOpacity(entry.id, Number(e.target.value))}
                      className="min-h-11 min-w-11 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent accent-[var(--color-signal)]"
                    />
                    <p className="mt-1 break-words text-xs font-mono text-muted">{entry.attribution}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
