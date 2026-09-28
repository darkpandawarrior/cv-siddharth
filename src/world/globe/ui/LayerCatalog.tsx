import { GIBS_BASES, GIBS_OVERLAYS, catalogDateLabel, type GibsCatalogEntry } from "../layers/gibsCatalog.ts";
import { simTime, useGlobe, type ImageryStack } from "../globeStore.ts";

/**
 * WAVE 2 LANE W1 (deep zoom): the NASA GIBS layer catalog UI — base picker,
 * overlay toggles with opacity sliders, and a legend for each active dated
 * overlay. LayerPanel.tsx (another lane, in parallel) renders this in its
 * own "Earth" section; this file only renders its own subtree, so it never
 * touches LayerPanel's own markup or classes. Sized to fit the 233px column
 * LayerPanel's panel already uses (`sm:w-[233px]`), same glass surface
 * (`border-line`, `bg-ink/70`, `font-mono`), 11px the smallest text anywhere
 * here, and every control a native `<button>`/`<input>` — keyboard access
 * (Tab, Enter/Space, arrow keys on the slider) comes for free rather than
 * needing a hand-rolled roving-tabindex widget for four base buttons and
 * eight overlay rows.
 */

const DEFAULT_OVERLAY_OPACITY = 0.75;
// Fibonacci spacing steps this lane's own brief calls for (8/13/21px) — the
// site-wide scale doesn't define these as tokens, so they're arbitrary
// Tailwind values rather than invented utility classes.
const GAP_8 = "gap-[8px]";
const PAD_13 = "p-[13px]";
const SPACE_8 = "space-y-[8px]";
const MB_13 = "mb-[13px]";
const MB_21 = "mb-[21px]";

function isOverlayActive(imagery: ImageryStack, id: string): boolean {
  return imagery.overlays.some((o) => o.id === id);
}

function overlayOpacity(imagery: ImageryStack, id: string): number {
  return imagery.overlays.find((o) => o.id === id)?.opacity ?? DEFAULT_OVERLAY_OPACITY;
}

/** A compact colour-stop legend: a gradient bar built from the entry's own
 *  stops, plus its first/last labels — the full label list wouldn't fit an
 *  N stop legend into a 233px column without wrapping into unreadable text. */
function Legend({ legend }: { legend: NonNullable<GibsCatalogEntry["legend"]> }) {
  const gradient = `linear-gradient(to right, ${legend.stops.map((s, i) => `${s.color} ${(i / Math.max(1, legend.stops.length - 1)) * 100}%`).join(", ")})`;
  return (
    <div className="mt-1" aria-hidden={false}>
      <div className="h-2 w-full rounded-full" style={{ background: gradient }} />
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted">
        <span>
          {legend.stops[0].label} {legend.unit}
        </span>
        <span>
          {legend.stops[legend.stops.length - 1].label} {legend.unit}
        </span>
      </div>
    </div>
  );
}

export default function LayerCatalog() {
  const imagery = useGlobe((s) => s.imagery);
  const setImagery = useGlobe((s) => s.setImagery);
  const timeOffsetMin = useGlobe((s) => s.timeOffsetMin);
  const now = simTime(timeOffsetMin);

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

  return (
    <div data-globe-layer-catalog className={`w-full max-w-[233px] font-mono text-[11px] text-zinc-300`}>
      <section className={MB_21}>
        <h4 className={`${MB_13} text-[11px] uppercase tracking-wide text-muted`}>Base imagery</h4>
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
                title={entry.description}
                className={`rounded-lg border px-2 py-1.5 text-left leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "border-accent/60 bg-accent/20 text-accent" : "border-line text-zinc-300 hover:bg-white/5"
                }`}
              >
                <div className="truncate">{entry.title}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted">{catalogDateLabel(activeBase, now)}</p>
      </section>

      <section>
        <h4 className={`${MB_13} text-[11px] uppercase tracking-wide text-muted`}>Overlays</h4>
        <ul className={SPACE_8}>
          {GIBS_OVERLAYS.map((entry) => {
            const active = isOverlayActive(imagery, entry.id);
            const opacity = overlayOpacity(imagery, entry.id);
            const inputId = `layer-catalog-opacity-${entry.id}`;
            return (
              <li key={entry.id} className={`rounded-lg border border-line ${PAD_13} ${GAP_8}`}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleOverlay(entry.id)}
                  title={entry.description}
                  className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className={`truncate ${active ? "text-zinc-100" : "text-zinc-500"}`}>{entry.title}</span>
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
                      className="w-full accent-[var(--color-signal)]"
                    />
                    {entry.legend && <Legend legend={entry.legend} />}
                    <p className="mt-1 truncate text-[11px] text-muted" title={catalogDateLabel(entry, now)}>
                      {catalogDateLabel(entry, now)}
                    </p>
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
