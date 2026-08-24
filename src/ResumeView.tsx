import { ArrowLeft, Github, Globe, Linkedin, Printer } from "lucide-react";
import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { profile, resumeMetrics, experience, education, resumeSkills, skills, languages, competencies, projects, openSource, upstreamMergedPRs} from "./data/profile.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { emphasise } from "./lib/resumeEmphasis.tsx";

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
  const shown = projects.filter((p) => fits(p.tier));
  const linked = projects.filter((p) => !fits(p.tier));
  // Seven ATS groups on the full record, four on the shorter cuts. Grouped and
  // labelled on every cut: a single comma-run of forty tokens was tried here to
  // win keyword coverage and it read as keyword stuffing on the page.
  const skillGroups = full ? resumeSkills : skills;
  // Vertical rhythm is the last lever before content has to go: on the
  // one-pager the gaps between sections tighten rather than a bullet dying.
  const gap = "mt-4";
  const jobGap = "mt-3";
  // Relaxed leading is a luxury of having a second page. The one-pager reads
  // fine at snug and it is the difference between fitting and not.
  const lead = "leading-relaxed";
  // Heading-to-body margin, same reasoning as `gap`.
  const headGap = "mt-1.5";
  // Two accents carry the whole design: teal labels the structure, violet names
  // the employers. Everything else stays near-black so the page still reads as
  // a document rather than a brochure — and prints legibly in greyscale.
  const h2 = "font-display text-xs font-bold uppercase tracking-widest text-teal-700";
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-zinc-200 py-8 print:bg-white print:py-0">
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
            className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
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
          <address className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm not-italic text-zinc-600">
            <a href={`tel:${profile.phone.replace(/\s+/g, "")}`} className="text-zinc-600">
              {profile.phone}
            </a>
            <span className="text-zinc-300">·</span>
            <a href={`mailto:${profile.email}`} className="text-zinc-600">
              {profile.email}
            </a>
            {[
              { Icon: Linkedin, href: profile.linkedin, label: profile.linkedin.replace(/^https:\/\//, "") },
              { Icon: Github, href: profile.github, label: profile.github.replace(/^https:\/\//, "") },
              { Icon: Globe, href: profile.portfolio, label: profile.portfolio.replace(/^https:\/\//, "") },
            ].map(({ Icon, href, label }) => (
              <Fragment key={href}>
                <span className="text-zinc-300">·</span>
                <a href={href} className="inline-flex items-center gap-1 text-zinc-600">
                  <Icon size={12} className="shrink-0 text-violet-600" aria-hidden="true" />
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
          <div className="mt-1.5 h-[2px] w-full bg-gradient-to-r from-violet-600 via-violet-500 to-teal-500" />
        </header>

        {/* Professional Summary */}
        <section className={gap}>
          <h2 className={h2}>
            Professional Summary
          </h2>
          <p className={`${headGap} text-sm ${lead} text-zinc-700`}>
            {budget === 1 ? profile.summaryShort : profile.summary}
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
            Key Results
          </h2>
          <p className={`${headGap} text-sm ${lead} text-zinc-800`}>
            {resumeMetrics.map((m) => `${m.value} ${m.label}`).join(" · ")}
          </p>
        </section>
        )}

        {/* Experience */}
        <section className={gap}>
          <h2 className={h2}>
            Experience
          </h2>
          {/* A role whose every bullet is non-core drops out entirely on the
              short cut — otherwise it would print as a heading with nothing
              under it, which reads worse than its absence. */}
          {experience
            .map((job) => ({ job, points: job.points.filter((p) => fits(p.tier)) }))
            .filter(({ points }) => points.length > 0)
            .map(({ job, points }) => (
            <div key={job.company} className={jobGap}>
              <div className="flex items-baseline justify-between gap-4 break-after-avoid">
                <h3 className="text-sm font-bold text-zinc-900">
                  <span className="font-display text-violet-700">{job.company}</span>
                  <span className="font-normal text-zinc-400"> · </span>
                  {job.role}
                </h3>
                <p className="shrink-0 text-xs text-zinc-500">{job.period}</p>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm leading-snug text-zinc-700">
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
            Projects & Open Source
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
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="min-w-0 text-sm font-bold text-violet-700">{p.name}</h3>
                <p className="min-w-0 truncate text-xs text-zinc-500">{p.stack.slice(0, 2).join(" · ")}</p>
              </div>
              <p className="text-sm leading-snug text-zinc-700">
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
              {budget === 1
                ? `${linked.slice(0, 3).map((p) => p.name).join(", ")} and ${linked.length - 3} more`
                : linked.map((p) => p.name).join(", ")}
              {". "}Written up in full at {profile.portfolio.replace("https://", "")}.
              {/* On the one-pager the open-source credit rides on the end of
                  this paragraph instead of claiming its own: a second <p> costs
                  a margin plus a line box to carry eight words. */}
              {!full && (
                <>
                  {" "}
                  <span className="font-semibold text-zinc-900">Upstream:</span> {upstreamMergedPRs} merged PRs to
                  career-ops (public OSS, 63k+ stars).
                </>
              )}
            </p>
          )}
          {/* Rendered from the same openSource data as the homepage so this
              line can never drift from the real merged-PR list again. The
              two-pager states the count and stops: four PR titles spelled out
              cost three lines to say what "9 merged PRs" already said. */}
          {full && (
            <p className="mt-2 text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Upstream contributions:</span>{" "}
              {upstreamMergedPRs} merged PRs to career-ops (public OSS, 63k+ stars)
              {full ? <>: {openSource.map((c) => c.title.replace(/^(feat|fix)\([^)]*\): /, "")).join("; ")}.</> : "."}
            </p>
          )}
        </section>

        {/* Education */}
        <section className={gap}>
          <h2 className={h2}>
            Education
          </h2>
          <div className={`${headGap} flex items-baseline justify-between gap-4`}>
            <p className="text-sm font-bold">
              {education.degree} · {education.school}
            </p>
            <p className="shrink-0 text-xs text-zinc-500">{education.period}</p>
          </div>
        </section>

        {/* Skills */}
        <section className={gap}>
          <h2 className={h2}>
            Technical Skills
          </h2>
          <div className={`${headGap} space-y-1`}>
            {/* One line on the one-pager: a standalone "Languages:" row costs a
                whole line box to carry four words. */}
            <p className="text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Languages:</span> {languages.join(", ")}
              {budget === 1 && (
                <>
                  {" · "}
                  <span className="font-semibold text-zinc-900">Core:</span> {competencies.join(", ")}
                </>
              )}
            </p>
            {budget === 1 ? null : (
              skillGroups.map((s) => (
                <p key={s.group} className="text-sm leading-snug text-zinc-700">
                  <span className="font-semibold text-zinc-900">{s.group}:</span> {s.items.join(", ")}
                </p>
              ))
            )}
          </div>
        </section>
      </article>
    </main>
  );
}
