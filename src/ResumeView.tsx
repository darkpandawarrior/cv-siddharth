import { ArrowLeft, Github, Globe, Linkedin, PenLine, Printer } from "lucide-react";
import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { profile, resumeMetrics, experience, education, resumeSkills, skills, languages, competencies, projectCards, openSource, upstreamMergedPRs, upstreamStars} from "./data/profile.ts";
import { mifosMergedPRs } from "./data/careerOpsUpstream.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { emphasise } from "./lib/resumeEmphasis.tsx";
import { concurrentCompanies } from "./lib/resumeMeta.ts";

/**
 * Print-perfect résumé rendered from the same data as the portfolio.
 * "Save as PDF" in the print dialog produces the shareable document.
 *
 * Three cuts of one dataset, never three datasets:
 *   /resume           — the complete record, no page budget. Every bullet,
 *                       every project, all seven ATS skill groups. This is the
 *                       default because it is what the page has always shown,
 *                       and because the site is the place to hold everything.
 *   /resume?cut=two   — two pages. The usual send.
 *   /resume?cut=one   — one page, for applications that demand a single page.
 * Each shorter cut is a filter over the longer one, so nothing is ever deleted
 * to make it fit and the three can never disagree about a fact. Switching cuts
 * re-renders from the same data, so a résumé in any format is always current
 * with profile.ts — no regeneration step, no stale copy.
 */
export type ResumeCut = "one" | "two" | "full";

// A bullet shows when its tier is at or below the cut's budget. `full` admits
// everything, including the untiered items that exist only there.
const BUDGET: Record<ResumeCut, number> = { one: 1, two: 2, full: Infinity };

export function ResumeView({ cut = "full" }: { cut?: ResumeCut }) {
  const { goToSection } = useSectionNav();
  // Fall back to the full record on an unknown cut rather than trusting the
  // route to have sanitised it. An unrecognised value used to make `budget`
  // undefined, every `tier <= undefined` false, and the page render with zero
  // bullets — a blank résumé is the one output worse than a long one, and a
  // stray `?cut=` in a pasted URL should never produce it.
  const budget = BUDGET[cut] ?? BUDGET.full;
  const full = budget === BUDGET.full;
  const fits = (tier?: 1 | 2) => (tier ?? Infinity) <= budget;
  // The resolved cut, so the switcher highlights what is actually rendered
  // even when the URL asked for something that does not exist.
  const activeCut: ResumeCut = budget === 1 ? "one" : budget === 2 ? "two" : "full";
  // Projects below the bar still get named and linked — the memory of losing
  // them entirely is why this line exists. On the one-pager that is all of
  // them: nine taglines do not survive a single page, but nine names do.
  const shown = projectCards.filter((p) => fits(p.tier));
  const linked = projectCards.filter((p) => !fits(p.tier));
  // All eight ATS groups on the two-pager and the full record; the one-pager
  // renders none of them and carries `competencies` inline instead. Grouped
  // and labelled: a single comma-run of forty tokens was tried here to win
  // keyword coverage and it read as keyword stuffing on the page.
  const skillGroups = budget === 1 ? skills : resumeSkills;
  // Vertical rhythm is the last lever before content has to go: on the
  // one-pager the gaps between sections tighten rather than a bullet dying.
  const gap = "mt-4";
  const jobGap = "mt-3";
  // Relaxed leading is a luxury of having a second page. The one-pager reads
  // fine at snug and it is the difference between fitting and not.
  const lead = "leading-relaxed";
  // Measured 2026-09-18: the one-pager has NO slack. leading-normal on bullets, or
  // space-y-1 between them, each push it to two pages on their own. Snug stays.
  const bulletLead = "leading-snug";
  // Heading-to-body margin, same reasoning as `gap`.
  const headGap = "mt-1.5";
  // Two accents carry the whole design: teal labels the structure, violet names
  // the employers. Everything else stays near-black so the page still reads as
  // a document rather than a brochure — and prints legibly in greyscale.
  const h2 = "font-display text-xs font-bold uppercase tracking-widest text-teal-700";
  // Companies still marked Present. A skimming reader sees two entries with
  // no end date and no visual signal they overlap rather than one replacing
  // the other — this is what makes that overlap visible.
  const concurrent = concurrentCompanies(experience);
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-zinc-200 py-8 print:min-h-0 print:bg-white print:py-0">
      {/* Wraps: back-link + three cut links + a pill button is wider than a
          375px phone, and the bar ran 5px past the viewport. */}
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 print:hidden">
        <button type="button" onClick={() => goToSection("top")} className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900">
          <ArrowLeft size={16} /> Back to portfolio
        </button>
        <div className="flex items-center gap-3">
          {([
            ["full", "Full record"],
            ["two", "2 pages"],
            ["one", "1 page"],
          ] as const).map(([id, label]) => (
            <Link
              key={id}
              to="/resume"
              // `full` is the default, so it carries no param and the URL
              // people paste stays a bare /resume showing everything.
              search={id === "full" ? {} : { cut: id }}
              className={
                id === activeCut
                  ? "text-sm font-semibold text-zinc-900"
                  : "text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
              }
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-accent-dim"
          >
            <Printer size={15} /> Download PDF
          </button>
        </div>
      </div>

      <article className="resume mx-auto max-w-[210mm] bg-white px-10 py-9 text-zinc-900 shadow-xl print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {/* Header */}
        <header className="pb-1.5">
          {/* text-hero on screen, matching every other route's h1 — but pinned
              back to the original fixed size for print. --text-hero is a
              vw-based clamp, and print media doesn't reliably rebase vw to the
              paper width (Chromium keeps using the on-screen window width),
              so letting it through to print risked ~doubling the header and
              pushing this off its one printed page. */}
          <h1 className={"font-display text-hero print:text-3xl font-bold tracking-tight"}>{profile.name}</h1>
          <p className={"mt-0.5 text-lg font-medium text-zinc-700"}>{profile.resumeTitle}</p>
          {/* Icon + host/handle. Chromium does write the anchor into the PDF as
              a link annotation, so the printed copy is clickable — but an ATS
              reads the text layer and discards annotations, and the bare handle
              form put no `linkedin.com` or `github.com` string anywhere in it.
              Verified: `pdftotext | grep -c 'linkedin.com\|github.com'` was 0,
              so the profile fields never populated. The host earns its width. */}
          {/* <address>, because that is what this is: the contact details for
              the document's subject. It carries the semantic for a screen
              reader and for anything parsing the page, and `not-italic`
              cancels the UA default so nothing changes visually.

              The phone was the one contact field that was plain text while
              email and all three profile links were already anchors — so on a
              phone, the number a recruiter most wants to tap was the one thing
              they could not. Spaces are stripped from the href (a `tel:` URI
              takes no whitespace) while the displayed text keeps them. */}
          <address className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm not-italic text-zinc-600 [&_a]:min-h-6 [&_a]:inline-flex [&_a]:items-center print:gap-y-0.5 print:[&_a]:min-h-0">
            <a href={`tel:${profile.phone.replace(/\s+/g, "")}`} className="text-zinc-600">
              {profile.phone}
            </a>
            <span className="text-zinc-300">|</span>
            <a href={`mailto:${profile.email}`} className="text-zinc-600">
              {profile.email}
            </a>
            {[
              { Icon: Linkedin, href: profile.linkedin, label: profile.linkedin.replace(/^https:\/\//, "") },
              { Icon: Github, href: profile.github, label: profile.github.replace(/^https:\/\//, "") },
              { Icon: Globe, href: profile.portfolio, label: profile.portfolio.replace(/^https:\/\//, "") },
              // Published writing, added 2026-09-18. Three years of it and the résumé
              // named none of it. It is also the cheapest proof of the communication
              // axis, which is the single most requested thing in real senior reqs.
              { Icon: PenLine, href: profile.writing, label: profile.writing.replace(/^https:\/\//, "") },
            ].map(({ Icon, href, label }) => (
              <Fragment key={href}>
                <span className="text-zinc-300">|</span>
                <a href={href} className="inline-flex items-center gap-1 text-zinc-600">
                  <Icon size={12} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  {label}
                </a>
              </Fragment>
            ))}
          </address>
          <p className="mt-0.5 text-sm text-zinc-600">
            {profile.location} · {budget === 1 ? profile.availabilityShort : profile.availability}
          </p>
          {/* The header's lid. This genuinely replaces the old
              `border-b-2 border-zinc-900` — leaving both drew two rules stacked
              on top of each other. */}
          {/* Solid, single accent, 1px. Replaced a violet-to-teal gradient on 2026-09-18:
              a gradient is decoration rather than structure, and it degrades to a flat
              grey smear in greyscale printing and photocopies, which is how a lot of
              résumés are still read. */}
          <div className="mt-1.5 h-px w-full bg-teal-600" />
        </header>

        {/* Professional Summary */}
        <section className={gap}>
          <h2 className={h2}>
            Professional Summary
          </h2>
          <p className={`${headGap} text-sm ${lead} text-zinc-700`}>
            {emphasise(budget === 1 ? profile.summaryShort : profile.summary)}
          </p>
        </section>

        {/* Core Competencies — full cut only. Every chip here reappears almost
            verbatim under Technical Skills (Compose, Clean Architecture,
            Coroutines, Hilt, Room, location, Keystore, SSL pinning, Fastlane),
            so on the short cut it was a second copy of a section further down,
            costing a sixth of a page to say the same words twice. The export
            stays — LinkedIn's skills list still renders from it. */}
        {full && (
          <section className={gap}>
            <h2 className={h2}>
              Core Competencies
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {competencies.map((c) => (
                <span
                  key={c}
                  className="rounded border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-900"
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Key Results — omitted on the one-pager: every number in it also
            appears in the summary or a bullet, so it is pure duplication, and
            one page has to spend its height on something that is not. */}
        {budget !== 1 && (
        <section className={gap}>
          <h2 className={h2}>
            Key Achievements
          </h2>
          <p className={`${headGap} text-sm ${lead} text-zinc-800`}>
            {resumeMetrics.map((m, i) => (
              <Fragment key={m.label}>
                {i > 0 && " · "}
                <span className="font-mono tabular-nums font-semibold">{m.value}</span> {m.label}
              </Fragment>
            ))}
          </p>
        </section>
        )}

        {/* Experience */}
        <section className={gap}>
          <h2 className={h2}>
            Professional Experience
          </h2>
          {/* A role whose every bullet is non-core drops out entirely on the
              short cut — otherwise it would print as a heading with nothing
              under it, which reads worse than its absence. */}
          {experience
            .map((job) => ({ job, points: job.points.filter((p) => fits(p.tier)) }))
            .filter(({ points }) => points.length > 0)
            .map(({ job, points }) => (
            <div key={job.company} className={jobGap}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 print:flex-row print:items-baseline print:justify-between break-after-avoid">
                <h3 className="text-sm font-bold text-zinc-900">
                  <span className="font-display text-violet-700">{job.company}</span>
                  <span className="font-normal text-zinc-400"> | </span>
                  {job.role}
                </h3>
                <p className="text-xs text-zinc-500 sm:shrink-0">
                  {job.period} | {job.location}
                </p>
              </div>
              {concurrent.length > 1 && concurrent.includes(job.company) && (
                <p className="text-xs italic text-zinc-500">
                  Concurrent with {concurrent.filter((c) => c !== job.company).join(", ")}
                </p>
              )}
              <ul className={`mt-1 list-disc space-y-0.5 pl-4 text-sm ${bulletLead} text-zinc-700`}>
                {points.map((p) => (
                  <li key={p.text}>
                    {p.label && <strong className="font-semibold text-zinc-900">{p.label}: </strong>}
                    {emphasise(p.text)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Projects & Open Source — break-inside-avoid lives on each entry
            below, not here: the full cut is taller than one page, so avoiding
            a break on the whole section would just force one giant gap. */}
        <section className={gap}>
          <h2 className={h2}>
            Projects
          </h2>
          {shown.map((p) => (
            <div key={p.slug} className="mt-2">
              {/* Two stack items, and the label may shrink. Three plus
                  `shrink-0` ran past the right margin and Chromium clipped it
                  mid-word — "Spring Boot 4" printed as "Spring Boot 4" minus
                  the page. A résumé that loses words at the paper's edge is
                  worse than one that names one fewer framework. */}
              {/* min-w-0, not shrink-0. The comment above is about the stack
                  label; the NAME had the same bug in the other direction —
                  "cv-siddharth — this site, and its Compose Multiplatform twin"
                  is 409px of unshrinkable heading, so /resume scrolled 74px
                  sideways on a phone. It still wins the space it needs on
                  paper, where the sheet is 210mm and there is room. */}
              {/* Name and stack on ONE line, not a justify-between row.
                  The old layout put a bold name hard left and a light label hard
                  right, which is byte-for-byte the shape of the EXPERIENCE rows
                  above it ("Dice.tech" ... "June 2023 - September 2026"). An ATS
                  parser matched the pattern and bucketed all four projects as
                  employment entries with no dates, which is the single largest
                  per-position parsing loss on the two-pager. Running them inline
                  breaks the visual rhyme and reads the same to a human. */}
              <p className="text-sm leading-snug text-zinc-700">
                <span className="font-bold text-violet-700">{p.name}</span>
                {/* Middot, never a dash. The résumé surface is at zero em and en
                    dashes and a test would not catch this one, because it lives
                    in JSX rather than in the profile data. */}
                <span className="text-zinc-400"> | </span>
                <span className="text-xs text-zinc-500">{p.stack.slice(0, 2).join(", ")}</span>
                <br />
                {p.tagline} {p.highlights[0]}
              </p>
            </div>
          ))}
          {/* The projects that lost their write-up still get named, stacked and
              pointed at — one line beats six paragraphs of side project on a
              document whose job is the employment history. */}
          {linked.length > 0 && (
            <p className="mt-2 text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Also built:</span>{" "}
              {/* The one-pager names the three that carry the most weight and
                  counts the rest. Nine project names are nine tokens an ATS
                  does not match on, and that space buys keyword coverage in
                  Technical Skills, which it does match on. */}
              {/* Names only. The per-project "(Kotlin Multiplatform)" tag was
                  repeating the same three words six times and cost the
                  two-pager its second page; the stack is on the portfolio. */}
              {(budget === 1 ? linked.slice(0, 3) : linked).map((p, i, a) => (
                <Fragment key={p.slug}>
                  {i > 0 && ", "}
                  <span className="font-semibold text-violet-700">{p.name}</span>
                  {budget === 1 && i === a.length - 1 && ` and ${linked.length - 3} more`}
                </Fragment>
              ))}
              {". "}Written up in full at {profile.portfolio.replace("https://", "")}.
              {/* On the one-pager the open-source credit rides on the end of
                  this paragraph instead of claiming its own: a second <p> costs
                  a margin plus a line box to carry eight words. */}
              {!full && (
                <>
                  {" "}
                  <span className="font-semibold text-zinc-900">Upstream:</span> {upstreamMergedPRs} merged PRs to{" "}
                  <span className="whitespace-nowrap">career-ops</span> (public OSS, {upstreamStars} stars).
                </>
              )}
            </p>
          )}
          {/* Rendered from the same openSource data as the homepage so this
              line can never drift from the real merged-PR list again. The
              two-pager states the count and stops: four PR titles spelled out
              cost three lines to say what "9 merged PRs" already said.
              Filtered to career-ops-hq's merged rows only — openSource now
              also carries the one open career-ops PR and the openMF/Mifos
              rows below, neither of which belongs in "merged PRs to
              career-ops". */}
          {full && (
            <p className="mt-2 text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Upstream contributions:</span>{" "}
              {upstreamMergedPRs} merged PRs to <span className="whitespace-nowrap">career-ops</span> (public OSS, {upstreamStars} stars)
              : {openSource.filter((c) => c.org === "career-ops-hq" && c.status === "merged").map((c) => c.title.replace(/^(feat|fix)\([^)]*\): /, "")).join("; ")}.
            </p>
          )}
          {/* A second, unrelated upstream: openMF/Mifos. Its own paragraph
              rather than folded into the one above, for the same reason
              ReposShowcase gives it a separate heading — grouping by org
              keeps career-ops's count honest instead of quietly absorbing
              these rows. */}
          {full && (
            <p className="mt-1 text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Also contributing to openMF/Mifos:</span>{" "}
              {mifosMergedPRs} merged (openMF/kmp-project-template #298, #299), plus 2 open (mifos-passcode-cmp #82, mifos-x-actionhub #89).
            </p>
          )}
        </section>

        {/* Education */}
        <section className={gap}>
          <h2 className={h2}>
            Education
          </h2>
          {/* One text node, date included, not a right-flushed flex split: a
              wide justify-between gap made Poppler's column-clustering treat
              the date as a separate run and flush it three lines downstream
              of the degree on raw (non `-layout`) extraction — the mode most
              ATS text-extractors use. Inline keeps the date adjacent to what
              it dates. */}
          <p className={`${headGap} text-sm font-bold`}>
            {education.degree} · {education.school}
            <span className="ml-2 font-normal text-xs text-zinc-500">· {education.period}</span>
          </p>
        </section>

        {/* Skills */}
        <section className={`${gap} break-inside-avoid`}>
          <h2 className={h2}>
            Technical Skills
          </h2>
          <div className={`${headGap} space-y-1`}>
            {/* One line on the one-pager: a standalone "Languages:" row costs a
                whole line box to carry four words. */}
            <p className="text-sm leading-snug text-zinc-600">
              <span className="font-semibold text-teal-700">Languages</span>
              <span className="text-zinc-300">{"  "}</span>
              {languages.join(", ")}
            </p>
            {/* The one-pager used to render NO skill groups at all: just this
                Languages line plus `competencies` run inline after it. Measured
                2026-09-17, that cost it 37 terms the two-pager carries, while the
                page still had roughly 20 blank lines at the bottom. It was paying
                for brevity it did not need. It now renders the compact four-group
                `skills` array (the eight-group `resumeSkills` is the longer cuts'),
                which is both more terms and a structure an ATS buckets correctly.
                If this ever busts the one-page budget, drop a group, not the
                section: print-resume.mjs fails the build rather than shipping two
                pages under a file named 1PAGE. */}
            {/* Redesigned 2026-09-18. Every group used to be the same weight of grey
                with a bold black label, so eight of them read as one undifferentiated
                block, which is the largest single thing on the one-pager. Three
                changes, none of them structural, so the text layer is untouched:
                the label goes teal, which is already the document's structural accent
                (section headings use it), and running it down the left edge gives the
                block a spine the eye can follow; a hairline rule separates groups so
                a wrapped run cannot visually merge into the next label; and the items
                sit at a lighter weight so the labels win the scan. Deliberately NOT
                chips: at forty-plus terms they cost roughly three extra lines each in
                padding, and this cut has no slack at all. */}
            {skillGroups.map((s, gi) => (
                <p
                  key={s.group}
                  className={`text-sm leading-snug text-zinc-600 ${gi > 0 ? "mt-1 border-t border-zinc-100 pt-1" : ""}`}
                >
                  <span className="font-semibold text-teal-700">{s.group}</span>
                  <span className="text-zinc-300">{"  "}</span>
                  {/* Each item is nowrap, so a two-word skill never splits across a
                      line. "Deep linking" was rendering as "Deep" / "linking" and an
                      ATS matching the phrase scored it MISSING even though it was on
                      the page. That silently loses a term per wrap, and which terms
                      it loses changes every time the copy reflows, so it is worth
                      fixing structurally rather than by reordering the list. The
                      comma stays outside the span so lines can still break there. */}
                  {s.items.map((item, i) => (
                    <Fragment key={item}>
                      {i > 0 && ", "}
                      <span className="sm:whitespace-nowrap print:whitespace-nowrap">{item}</span>
                    </Fragment>
                  ))}
                </p>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
