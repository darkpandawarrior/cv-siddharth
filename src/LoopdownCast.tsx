import { loopdownArt, type LoopdownArt } from "./data/loopdownArt.ts";
import { writing, type Lesson } from "./data/writing.ts";
import { heavy } from "./lib/assetBase.ts";
import { titleize } from "./data/writingMeta.ts";

/**
 * The Loopdown's generated art (13 cast portraits, 8 series covers), joined
 * against the hand-maintained registry data. REC-9's separation rule: this
 * cast is engineering personification and is not Morkinstar, so it never
 * reuses that world's panel classes (`.ink-world`, `.piece-docket`) or its
 * season palette (ember, paper), only the same `panel-sm card-elevated`
 * treatment the rest of /loopdown already uses.
 */
export const castArt = (id: string): LoopdownArt | undefined =>
  loopdownArt.find((a) => a.kind === "cast" && a.id === id);

export const seriesArt = (id: string): LoopdownArt | undefined =>
  loopdownArt.find((a) => a.kind === "series" && a.id === id);

/**
 * The cast id billed for a lesson's card avatar, read off its series' own
 * cast_ids. A series can bill more than one member (crossing-the-schema:
 * the-ferryman AND the-vault-keeper); the registry publishes no per-lesson
 * join finer than that, so every lesson in a series gets that series' first
 * billed member.
 * ponytail: per-lesson cast join, if the-loopdown registry ever publishes one.
 */
export const leadCastIdOf = (seriesId?: string): string | undefined => seriesArt(seriesId ?? "")?.castIds[0];

/** A cast member is "summoned" once a lesson exists that stars them: the
 *  lesson-cast join REC-9 requires, never a hand-kept list. */
const summonedIds = new Set(writing.cast.map((c) => c.id));
export const isSummoned = (id: string): boolean => summonedIds.has(id);
const appearancesOf = (id: string): number => writing.cast.find((c) => c.id === id)?.appearances ?? 0;

/**
 * The newest lesson to actually go live somewhere: reality-spec.md#6's
 * "/loopdown, /read/$slug live age" row reads this one entry. `writing.ts`
 * is not guaranteed sorted, so this is a real max over `created`, not
 * `lessons[0]`.
 */
export function newestLiveLesson(): Lesson | undefined {
  return writing.lessons
    .filter((l): l is Lesson & { created: string } => Boolean(l.links?.devto || l.links?.hashnode || l.links?.medium || l.links?.linkedin) && Boolean(l.created))
    .sort((a, b) => b.created.localeCompare(a.created))[0];
}

/**
 * "published N d ago", whole days only (reality-spec.md#6). `now === null`
 * before the client clock mounts (SSR / first paint): every other live
 * label on this site (CiStrip's agoLabel, useSky) returns null there too, so
 * the page always ships the SSR absolute date with nothing to hydrate over.
 */
export function lessonAgeLabel(createdISO: string, now: Date | null): string | null {
  if (!now) return null;
  const days = Math.floor(Math.max(0, now.getTime() - new Date(`${createdISO}T00:00:00Z`).getTime()) / 86_400_000);
  return days === 0 ? "published today" : `published ${days} d ago`;
}

const CAST_COLORS = ["#8f74ff", "#4ec9b0", "#f0883e", "#db61ff", "#38bdf8"];

export function LoopdownCast() {
  const cast = loopdownArt.filter((a) => a.kind === "cast");
  const summoned = cast.filter((c) => isSummoned(c.id));
  const waiting = cast.filter((c) => !isSummoned(c.id));

  return (
    <section id="cast-gallery" className="border-t border-line section-y scroll-mt-24">
      <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted">
        The bestiary <span className="text-muted">· every recurring character, drawn</span>
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-zinc-400">
        The full cast, generated once and kept: the {summoned.length} who already star in a lesson, and
        the {waiting.length} still waiting in the wings.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {[...summoned, ...waiting].map((c, i) => {
          const wingIt = !isSummoned(c.id);
          const color = CAST_COLORS[i % CAST_COLORS.length];
          return (
            <figure
              key={c.id}
              data-testid={`cast-${c.id}`}
              data-summoned={!wingIt}
              className="panel-sm card-elevated flex flex-col items-center gap-2 p-3 text-center"
              style={wingIt ? { border: `1px dashed ${color}88` } : { borderColor: `${color}55` }}
            >
              {/* The dashed border already reads as "not yet summoned"; fading
                  the portrait (not the caption underneath it) keeps that same
                  read without also dropping the caption text below AA
                  contrast the way dimming the whole figure did (measured
                  2.7:1 against the required 4.5:1, axe a11y.spec.ts). */}
              <img
                src={heavy(c.src)}
                alt={c.alt}
                width={c.width}
                height={c.height}
                loading="lazy"
                className="h-20 w-20 rounded-full object-cover"
                style={wingIt ? { opacity: 0.5, filter: "grayscale(1)" } : undefined}
              />
              <figcaption className="text-xs font-semibold text-zinc-200">
                {titleize(c.id)}
                {wingIt ? (
                  <span className="mt-0.5 block text-xs font-normal text-muted">not yet summoned</span>
                ) : (
                  <span className="mt-0.5 block text-xs font-normal text-muted">×{appearancesOf(c.id)}</span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
