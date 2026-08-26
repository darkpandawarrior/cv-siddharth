import { useRendering, seasonRendering } from "./lib/rendering.ts";

/**
 * The Rendering control: the anthology read aloud by the reader's own machine.
 *
 * See src/lib/rendering.ts for why this uses no vendor, no key and no published
 * audio file. In one line: the correspondent has no body, a published voice
 * would give him one, and the reader's own synthesiser is a rig, which is the
 * only thing this fiction has ever let a reader hear anything through.
 *
 * It sits between the byline and the prose, not floating and not sticky. An
 * instrument you pick up, not a player that follows you down the page.
 *
 * ACCESSIBILITY, stated because the season three branch looks like the opposite
 * of it: this control gates NOTHING. The prose is real text in a real <article>
 * and every screen reader has always read all of it, including the thirteen
 * withdrawn pages. What season three refuses is this ornament, and it can
 * refuse it precisely because refusing it withholds nothing.
 */
export function Rendering({ body, season, kindling }: { body: string; season: number; kindling?: number }) {
  const mode = seasonRendering(season, kindling);
  const r = useRendering(body, season, kindling);

  // No speechSynthesis (Firefox on some platforms, older WebViews, and every
  // server render) means no control at all rather than a dead button.
  if (!r.supported) return null;

  if (!mode.offered) {
    return (
      <div className="rendering rendering--refused">
        <p className="rendering__label">{mode.label}</p>
        <p className="rendering__note">{mode.note}</p>
      </div>
    );
  }

  return (
    <div className="rendering">
      <div className="rendering__row">
        {!r.playing ? (
          <button type="button" className="rendering__button" onClick={r.start}>
            {mode.label}
          </button>
        ) : (
          <>
            <button type="button" className="rendering__button" onClick={r.paused ? r.resume : r.pause}>
              {r.paused ? "RESUME" : "PAUSE"}
            </button>
            <button type="button" className="rendering__button rendering__button--quiet" onClick={r.stop}>
              STOP
            </button>
          </>
        )}
        {/* Progress is a rule that fills, not a percentage. The corpus counts
            things at the reader constantly and one more number would join a
            conversation it is not part of. aria-hidden because the button text
            already announces state and a live percentage read aloud during a
            reading is the worst possible interruption. */}
        <span className="rendering__track" aria-hidden="true">
          <span className="rendering__fill" style={{ width: `${Math.round(r.progress * 100)}%` }} />
        </span>
        {/* The plates have carried this stamp since season one: an instrument
            reporting its own tolerance is a thing the Directory would print.
            Only shown while running, because a rig that is not carrying
            anything has no state to report. */}
        {r.playing && <span className={`rendering__rig rendering__rig--${r.rig}`}>RIG · {r.rig.toUpperCase()}</span>}
      </div>
      <p className="rendering__note">{mode.note}</p>
    </div>
  );
}
