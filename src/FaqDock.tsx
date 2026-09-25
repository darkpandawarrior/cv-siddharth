import { useId, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { ANSWERS, type Answer } from "./data/source/answers.ts";
import { buildFaqJsonLd, parseAnchor } from "./lib/faqJsonLd.ts";
import { EvidenceChip } from "./EvidenceChip.tsx";
import { openChat } from "./lib/chatBus.ts";

/**
 * The answer layer (arch-L11), docked — spine F1/F2/F14.
 *
 * Used to live inside FloatingChat, rendered below the footer or room pager
 * on 12 routes at 969-1,009px tall, with its FAQPage JSON-LD repeated on 24
 * routes. Docked here as SiteFooter's first band instead, so the order holds
 * by construction (nothing renders below `<footer>` but the footer's own
 * copyright line), collapsed to the spine budget (240 / 180px), and the
 * JSON-LD is emitted once, on `/` only (`jsonLd` prop).
 *
 * Still SSR-crawlable and still no-JS-safe: every question and every answer
 * renders unconditionally (no client-only gate), the accordion is a native
 * exclusive `<details name="faq">` group (no JS needed to toggle or to keep
 * at most one open — the browser does both), and the filter below defaults
 * to "" (matches everything), so a visitor with JS off sees every answer,
 * same as one with it on.
 */

/** Computed once, not per render — ANSWERS is static module data and `/` is
 *  the only route that ever mounts this with `jsonLd` true. */
const FAQ_JSON_LD = buildFaqJsonLd(ANSWERS);

/**
 * Pure: answers citing the current route sort first, everything else keeps
 * ANSWERS's own order (Array#sort is a stable sort, so a route with no
 * exact-matching citation — most routes — returns the array unchanged).
 * Same inputs, same output on the server and after hydration.
 */
export function rankAnswers(pathname: string, answers: readonly Answer[]): Answer[] {
  const onThisRoute = (a: Answer) => parseAnchor(a.anchor).path === pathname;
  return [...answers].sort((a, b) => Number(onThisRoute(b)) - Number(onThisRoute(a)));
}

export interface FaqDockProps {
  /** Only `/` marks up FAQPage JSON-LD — Google's own guidance is one
   *  instance when the same Q&A repeats sitewide (F14). */
  jsonLd?: boolean;
}

export function FaqDock({ jsonLd = false }: FaqDockProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ranked = useMemo(() => rankAnswers(pathname, ANSWERS), [pathname]);
  const [query, setQuery] = useState("");
  const filterLabelId = useId();
  const q = query.trim().toLowerCase();
  const visible = q
    ? ranked.filter((a) => a.question.toLowerCase().includes(q) || a.answer.toLowerCase().includes(q))
    : ranked;

  return (
    <div data-spine="faq" className="border-b border-line bg-surface px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 pb-2">
        <p className="kicker-accent">frequently asked</p>
        <label className="relative flex items-center">
          <span className="sr-only" id={filterLabelId}>
            Filter the frequently asked questions
          </span>
          <Search size={12} aria-hidden className="pointer-events-none absolute left-2.5 text-muted" />
          <input
            type="search"
            aria-labelledby={filterLabelId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="w-32 rounded-full border border-line bg-ink py-1 pl-7 pr-2.5 text-xs text-zinc-100 placeholder-muted outline-none focus:border-accent sm:w-44"
          />
        </label>
      </div>

      {visible.length === 0 && <p className="mx-auto max-w-6xl pb-2 text-xs text-muted">No answers match “{query.trim()}”.</p>}

      {/* >= 768: an auto-fit grid of exclusive <details>, each card growing
          to fit its own open content. < 768: the same <details> reflow into
          a horizontal snap row of question chips (summary only); every
          answer sits `position:absolute` in the one shared slot below the
          row, so whichever <details> the browser's native `name="faq"`
          grouping keeps open is the only one ever visible there — no JS
          drives either the layout switch or the single-open-answer rule. */}
      <div className="relative mx-auto grid max-w-6xl grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-1.5 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:gap-2 max-md:overflow-x-auto max-md:pb-2">
        {visible.map((a) => {
          const source = parseAnchor(a.anchor).path;
          return (
            <details
              key={a.id}
              name="faq"
              className="group rounded-lg border border-line bg-ink px-3 py-1.5 max-md:shrink-0 max-md:snap-start max-md:self-start"
            >
              <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent max-md:whitespace-nowrap">
                {a.question}
              </summary>
              {/* The 0fr -> 1fr grid-rows trick (desktop only, md:): a closed
                  <details> costs zero height with zero CLS on open — no JS,
                  and it is the same mechanism a browser with `interpolate-
                  size: allow-keywords` would give `height: auto` directly,
                  so this degrades to that rather than fighting it. Instant
                  under reduced motion. Mobile skips the animation outright
                  (it is an absolutely positioned overlay, not an inline
                  height change) and just uses the browser's own open/close.

                  md:invisible/group-open:visible: overriding `display` above
                  (needed so the closed row keeps participating in the grid
                  layout at all) also undoes the UA's own `display:none` on a
                  closed <details>'s content — which is what normally pulls a
                  hidden card's evidence-chip link and follow-up button out
                  of the desktop tab order. `visibility` puts that back: a
                  closed card's controls are neither focusable nor exposed to
                  a screen reader, same as mobile's native display:none. */}
              <div className="md:invisible md:grid md:grid-rows-[0fr] md:transition-[grid-template-rows] md:duration-300 md:ease-out md:group-open:visible md:group-open:grid-rows-[1fr] md:motion-reduce:transition-none max-md:absolute max-md:inset-x-0 max-md:top-full max-md:z-20">
                <div className="md:overflow-hidden">
                  <div className="space-y-2 text-xs leading-relaxed text-zinc-400 md:pt-2 max-md:rounded-lg max-md:border max-md:border-line max-md:bg-ink max-md:p-3 max-md:shadow-lg">
                    <p>{a.answer}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <EvidenceChip file={source} source={source} cadence="undated" />
                      <button
                        type="button"
                        onClick={() => openChat({ context: { question: a.question, answer: a.answer, source } })}
                        className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:outline-none"
                      >
                        Ask Panda a follow-up
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />}
    </div>
  );
}
