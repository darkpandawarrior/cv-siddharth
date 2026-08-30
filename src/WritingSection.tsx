import { ArrowUpRight, PenLine } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { writing } from "./data/writing.ts";
import { Reveal } from "./Reveal.tsx";
import { ExcelsiorShelf } from "./Excelsior.tsx";
import { boardProfiles, societies, loopdownOrigin } from "./data/beforeTheCode.ts";
import { BOOKS_BEFORE_BROS } from "./data/writingMeta.ts";

/**
 * The creative half of the writing, mounted on /ink — the archive, the
 * magazine, the board profiles and the societies.
 *
 * It used to render the field-note lessons as well: a featured card, a queued
 * list and the series ticker, all of which /loopdown already renders in full
 * in its own skin. The same corpus in two places has no canonical copy, so the
 * split is by world now. The lessons live in the control room, the archive
 * lives here, and each page carries exactly one sentence pointing at the
 * other. The archive grid below arrived from WritingView for that reason: it
 * existed only there, and this is the world those pieces were written in.
 */
export function WritingSection() {
  const { archive } = writing;

  return (
    <section id="writing" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2">// the archive</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Writing</h2>
          {/* Derived, never typed. This count was a teaser card pointing at a
              grid on another page; the grid is below it now, so the number and
              the thing it counts finally sit on the same screen. */}
          <p className="mb-5 max-w-2xl text-zinc-400">
            {archive.length} pieces of short fiction, campus lore, satire and essays. Everything I
            wrote before I wrote code, first in a college magazine and then on a blog.
          </p>
          {/* The name is inherited, not invented — worth saying up front, since
              it is the whole reason an Android engineer has a writing section. */}
          <p className="mb-5 max-w-2xl border-l-2 border-accent/40 pl-4 text-sm leading-relaxed text-zinc-400">
            "The Loopdown" isn't a brand I made up. It's a short story I wrote for{" "}
            <Link
              to="/excelsior"
              search={{ year: Number(loopdownOrigin.year), page: loopdownOrigin.page }}
              className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
            >
              Excelsior '21
            </Link>
            , a week that refuses to end, 52 iterations of the same Wednesday. The hub, the repo and
            the series all still carry its name.
          </p>
          {/* The one cross-link, replacing the lesson grid that used to be
              duplicated here. Whoever opened The Ink came for this half. */}
          <p className="mb-10 max-w-2xl text-zinc-400">
            That hub is still running. The field notes, the series and the cast of personified bugs
            they star live in{" "}
            <Link
              to="/loopdown"
              className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
            >
              The Loopdown
            </Link>
            .
          </p>
        </Reveal>

        {/* The archive itself. Books Before Bros is where most of these were
            first published, so it heads the grid rather than sitting in it. */}
        <Reveal delay={100}>
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href={BOOKS_BEFORE_BROS.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-accent2/30 bg-accent2/5 p-4 transition hover:border-accent2/60 sm:col-span-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-zinc-100">
                  <PenLine size={14} className="text-accent2" /> {BOOKS_BEFORE_BROS.name}
                  <ArrowUpRight size={13} className="text-muted transition group-hover:text-accent2" />
                </h3>
                <span className="shrink-0 font-mono text-[11px] text-accent2/80">the origin blog</span>
              </div>
              <p className="mt-1.5 text-sm leading-snug text-zinc-400">
                {BOOKS_BEFORE_BROS.blurb} Most of the pieces below were first published there, at
                booksbeforebros.wordpress.com.
              </p>
            </a>
            {archive.map((a) => (
              <div key={a.slug} className="card-elevated rounded-xl border border-line bg-surface p-4 transition hover:border-accent2/40">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-zinc-100">{a.title}</h3>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{a.form}</span>
                </div>
                {a.blurb && <p className="mt-1.5 text-sm leading-snug text-zinc-400">{a.blurb}</p>}
                <div className="kicker mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {a.era && <span>{a.era}</span>}
                  {a.words && <span>{Number(a.words).toLocaleString()} words</span>}
                  {a.words && <span>~{Math.max(1, Math.round(Number(a.words) / 220))} min read</span>}
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* The print lineage. Before the blog and before the code there was a
            128-page institute magazine with my signature in the masthead — so
            it gets shown as a magazine, not as a line in a list. */}
        <Reveal delay={120}>
          <div className="panel mt-10 p-6 sm:p-8">
            <div className="meta-row">
              <span className="font-display text-base font-bold tracking-tight">
                Excelsior, MANIT's institute magazine
              </span>
              <span className="meta-row-tag">[&nbsp;print · 2019–21&nbsp;]</span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Three years on the Editorial Board at NIT Bhopal. English Editor on the 2019 and 2020
              editions, Joint Chief Editor on 2021. That last one was 128 pages shipped entirely
              remotely through the pandemic, and its cover story was the whole magazine: one frame
              story branching into three paths a reader chooses between. Hover a cover to open it.
            </p>
            <div className="mt-8">
              <ExcelsiorShelf />
            </div>

            {/* The part a CV cannot carry. Every year the board closes the
                magazine with EB Profiles: each member gets a question, and a
                teammate answers it in that member's voice. Three years of
                those are the only outside record of what I was actually like
                to work with.
                This used to end "so they run verbatim, credited to the board,
                not paraphrased into something flattering". They do not run
                verbatim — they never have — and the cuts had in fact made me
                look better, which is the exact thing that sentence promised
                they had not done. Trimmed, cuts marked, page linked.
                The arc these three describe used to be summarised in a
                paragraph under this grid, where it read as a caption. It is
                the epigraph of /ink now (see routes/ink.tsx), which is why
                nothing closes this block: the reader was handed that sentence
                before they got here. */}
            <div id="board" className="mt-12 scroll-mt-24 border-t border-line pt-8">
              <div className="meta-row">
                <span className="font-display text-base font-bold tracking-tight">How the board wrote me</span>
                <span className="meta-row-tag">[&nbsp;EB Profiles · in my voice, by them&nbsp;]</span>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
                Each year every board member gets one question, answered by a teammate impersonating
                them. Affectionate, unsparing, and not written by me, which is the only reason
                they're worth reading. Trimmed here to keep other people's names out of it;{" "}
                <span className="text-zinc-300">…</span> marks every cut, and each card opens the
                scanned page it came from.
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {boardProfiles.map((p) => (
                  <Link
                    key={p.year}
                    to="/excelsior"
                    search={{ year: Number(p.year), page: p.page }}
                    className="card-elevated group flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-accent2/50"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-bold text-accent2">{p.title}</span>
                      <span className="font-mono text-[10px] text-muted">'{p.year.slice(2)}</span>
                    </div>
                    <p className="kicker mt-1">{p.role}</p>
                    <p className="mt-3 text-xs italic text-muted">Q: {p.question}</p>
                    <blockquote className="mt-2 grow text-sm leading-relaxed text-zinc-300">"{p.quote}"</blockquote>
                    <p className="mt-3 font-mono text-[11px] text-muted">
                      ~「{p.direction}」~{p.gloss ? ` · ${p.gloss}` : ""}
                    </p>
                    {/* The card has always linked to the scan; nothing said so,
                        so the one thing that could verify these quotes was an
                        invisible affordance. A trimmed quote is only honest if
                        the untrimmed one is reachable, and reachable means
                        someone can tell it is there. Not a nested <a> — the
                        whole card is already the link. */}
                    <span className="kicker mt-4 transition group-hover:text-accent2">
                      Excelsior &rsquo;{p.year.slice(2)} · page {p.page} &rarr;
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* The two societies, and what they published. */}
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {societies.map((s) => (
                <div key={s.name} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="meta-row">
                    <span className="font-display text-sm font-bold">{s.name}</span>
                    <span className="meta-row-tag">[&nbsp;{s.years}&nbsp;]</span>
                  </div>
                  <p className="kicker-accent mt-3">{s.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.blurb}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {s.links.map((l) =>
                      l.url.startsWith("/") ? (
                        <Link key={l.url} to={l.url} className="text-xs font-semibold text-accent transition hover:text-accent-dim">
                          {l.label} →
                        </Link>
                      ) : (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-zinc-400 transition hover:text-accent2"
                        >
                          {l.label} ↗
                        </a>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
