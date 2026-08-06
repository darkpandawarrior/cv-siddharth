import { ArrowLeft, Printer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { profile, resumeMetrics, experience, education, resumeSkills, resumeSkillsCompact, skills, languages, competencies, projects, openSource } from "./data/profile.ts";
import { useSectionNav } from "./lib/navigation.ts";

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
  // Seven ATS groups on the full record, four on the two-pager. The one-pager
  // runs the compact token line instead: competency chips were tried here and
  // cost 14 of the 52 basket keywords, and keyword coverage is the heaviest
  // dimension an ATS scores. Same claims, denser encoding.
  const skillGroups = full ? resumeSkills : skills;
  const oneLineSkills = budget === 1 ? resumeSkillsCompact : null;
  // Vertical rhythm is the last lever before content has to go: on the
  // one-pager the gaps between sections tighten rather than a bullet dying.
  const gap = budget === 1 ? "mt-1.5" : "mt-4";
  const jobGap = budget === 1 ? "mt-2" : "mt-3";
  // Relaxed leading is a luxury of having a second page. The one-pager reads
  // fine at snug and it is the difference between fitting and not.
  const lead = budget === 1 ? "leading-snug" : "leading-relaxed";
  // Heading-to-body margin, same reasoning as `gap`.
  const headGap = budget === 1 ? "mt-1" : "mt-1.5";
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-zinc-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
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
        <header className={`border-b-2 border-zinc-900 ${budget === 1 ? "pb-2.5" : "pb-4"}`}>
          {/* text-hero on screen, matching every other route's h1 — but pinned
              back to the original fixed size for print. --text-hero is a
              vw-based clamp, and print media doesn't reliably rebase vw to the
              paper width (Chromium keeps using the on-screen window width),
              so letting it through to print risked ~doubling the header and
              pushing this off its one printed page. */}
          <h1 className={`font-display text-hero ${budget === 1 ? "print:text-2xl" : "print:text-3xl"} font-bold tracking-tight`}>{profile.name}</h1>
          <p className={`mt-0.5 ${budget === 1 ? "text-base" : "text-lg"} font-medium text-zinc-700`}>{profile.resumeTitle}</p>
          {/* Full `linkedin.com/in/…` and `github.com/…`, on every cut. Shorter
              handles were tried here to save a wrapped line and it cost the
              one-pager its LinkedIn parse: ATS pipelines match the literal
              `linkedin.com/in/<handle>`, and `in/<handle>` matches nothing.
              The line wrapped to two rows either way, so the trim bought no
              height and lost a contact field. */}
          <p className="mt-1.5 text-sm text-zinc-600">
            {profile.phone} · {profile.email} · {profile.linkedin.replace("https://", "")} ·{" "}
            {profile.github.replace("https://", "")}
          </p>
          <p className="mt-0.5 text-sm text-zinc-600">
            {profile.location} · {budget === 1 ? profile.availabilityShort : profile.availability}
          </p>
        </header>

        {/* Professional Summary */}
        <section className={gap}>
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
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
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
              Core Competencies
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {competencies.map((c) => (
                <span
                  key={c}
                  className="rounded border border-zinc-300 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Key Results */}
        <section className={gap}>
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Key Results
          </h2>
          <p className={`${headGap} text-sm ${lead} text-zinc-800`}>
            {resumeMetrics.map((m) => `${m.value} ${m.label}`).join(" · ")}
          </p>
        </section>

        {/* Experience */}
        <section className={gap}>
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Experience
          </h2>
          {/* A role whose every bullet is non-core drops out entirely on the
              short cut — otherwise it would print as a heading with nothing
              under it, which reads worse than its absence. */}
          {experience
            .map((job) => ({ job, points: job.points.filter((p) => fits(p.tier)) }))
            .filter(({ points }) => points.length > 0)
            .map(({ job, points }) => (
            <div key={job.company} className={`${jobGap} break-inside-avoid`}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-bold">
                  {job.role} · {job.company}
                </h3>
                <p className="shrink-0 text-xs text-zinc-500">{job.period}</p>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm leading-snug text-zinc-700">
                {points.map((p) => (
                  <li key={p.text}>
                    {p.label && <strong className="font-semibold text-zinc-900">{p.label}: </strong>}
                    {p.text}
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
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Projects & Open Source
          </h2>
          {shown.map((p) => (
            <div key={p.slug} className="mt-2 break-inside-avoid">
              {/* Two stack items, and the label may shrink. Three plus
                  `shrink-0` ran past the right margin and Chromium clipped it
                  mid-word — "Spring Boot 4" printed as "Spring Boot 4" minus
                  the page. A résumé that loses words at the paper's edge is
                  worse than one that names one fewer framework. */}
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="shrink-0 text-sm font-bold">{p.name}</h3>
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
              {" "}— written up in full at {profile.portfolio.replace("https://", "")}.
              {/* On the one-pager the open-source credit rides on the end of
                  this paragraph instead of claiming its own: a second <p> costs
                  a margin plus a line box to carry eight words. */}
              {budget === 1 && (
                <>
                  {" "}
                  <span className="font-semibold text-zinc-900">Upstream:</span> {openSource.length} merged PRs to
                  career-ops (public OSS, 60k+ stars).
                </>
              )}
            </p>
          )}
          {/* Rendered from the same openSource data as the homepage so this
              line can never drift from the real merged-PR list again. The
              two-pager states the count and stops: four PR titles spelled out
              cost three lines to say what "4 merged PRs" already said. */}
          {budget !== 1 && (
            <p className="mt-2 text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Upstream contributions:</span>{" "}
              {openSource.length} merged PRs to career-ops (public OSS, 60k+ stars)
              {full ? <> — {openSource.map((c) => c.title.replace(/^(feat|fix)\([^)]*\): /, "")).join("; ")}.</> : "."}
            </p>
          )}
        </section>

        {/* Education */}
        <section className={`${gap} break-inside-avoid`}>
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
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
        <section className={`${gap} break-inside-avoid`}>
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Technical Skills
          </h2>
          <div className={`${headGap} space-y-1`}>
            <p className="text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Languages:</span> {languages.join(", ")}
            </p>
            {oneLineSkills ? (
              <p className="text-sm leading-snug text-zinc-700">
                <span className="font-semibold text-zinc-900">Core:</span> {oneLineSkills}
              </p>
            ) : (
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
