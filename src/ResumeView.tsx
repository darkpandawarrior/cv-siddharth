import { ArrowLeft, Printer } from "lucide-react";
import { profile, metrics, experience, education, resumeSkills, languages, competencies, projects, openSource } from "./data/profile.ts";

/**
 * Print-perfect résumé rendered from the same data as the portfolio.
 * Reachable at /#resume — "Save as PDF" in the print dialog produces the
 * shareable document.
 */
export function ResumeView() {
  return (
    <div className="min-h-screen bg-zinc-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <a href="#top" className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900">
          <ArrowLeft size={16} /> Back to portfolio
        </a>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          <Printer size={15} /> Download PDF
        </button>
      </div>

      <article className="resume mx-auto max-w-[210mm] bg-white px-10 py-9 text-zinc-900 shadow-xl print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {/* Header */}
        <header className="border-b-2 border-zinc-900 pb-4">
          <h1 className="font-display text-3xl font-bold tracking-tight">{profile.name}</h1>
          <p className="mt-0.5 text-lg font-medium text-zinc-700">{profile.resumeTitle}</p>
          <p className="mt-1.5 text-sm text-zinc-600">
            {profile.phone} · {profile.email} · {profile.linkedin.replace("https://", "")} ·{" "}
            {profile.github.replace("https://", "")}
          </p>
          <p className="mt-0.5 text-sm text-zinc-600">
            {profile.location} · {profile.availability}
          </p>
        </header>

        {/* Professional Summary */}
        <section className="mt-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Professional Summary
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{profile.summary}</p>
        </section>

        {/* Core Competencies */}
        <section className="mt-4">
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

        {/* Key Results */}
        <section className="mt-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Key Results
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">
            {metrics.map((m) => `${m.value} ${m.label}`).join(" · ")}
          </p>
        </section>

        {/* Experience */}
        <section className="mt-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Experience
          </h2>
          {experience.map((job) => (
            <div key={job.company} className="mt-3 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-bold">
                  {job.role} · {job.company}
                </h3>
                <p className="shrink-0 text-xs text-zinc-500">{job.period}</p>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm leading-snug text-zinc-700">
                {job.points.map((p) => (
                  <li key={p.text}>
                    {p.label && <strong className="font-semibold text-zinc-900">{p.label}: </strong>}
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Projects & Open Source */}
        <section className="mt-4 break-inside-avoid">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Projects & Open Source
          </h2>
          {projects.map((p) => (
            <div key={p.slug} className="mt-2 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-bold">{p.name}</h3>
                <p className="shrink-0 text-xs text-zinc-500">{p.stack.slice(0, 3).join(" · ")}</p>
              </div>
              <p className="text-sm leading-snug text-zinc-700">
                {p.tagline} {p.highlights[0]}
              </p>
            </div>
          ))}
          {/* Rendered from the same openSource data as the homepage so this
              line can never drift from the real merged-PR list again. */}
          <p className="mt-2 text-sm leading-snug text-zinc-700">
            <span className="font-semibold text-zinc-900">Upstream contributions:</span>{" "}
            {openSource.length} merged PRs to career-ops (public OSS, 60k+ stars) —{" "}
            {openSource.map((c) => c.title.replace(/^(feat|fix)\([^)]*\): /, "")).join("; ")}.
          </p>
        </section>

        {/* Education */}
        <section className="mt-4 break-inside-avoid">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Education
          </h2>
          <div className="mt-1.5 flex items-baseline justify-between gap-4">
            <p className="text-sm font-bold">
              {education.degree} · {education.school}
            </p>
            <p className="shrink-0 text-xs text-zinc-500">{education.period}</p>
          </div>
        </section>

        {/* Skills */}
        <section className="mt-4 break-inside-avoid">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Technical Skills
          </h2>
          <div className="mt-1.5 space-y-1">
            <p className="text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">Languages:</span> {languages.join(", ")}
            </p>
            {resumeSkills.map((s) => (
              <p key={s.group} className="text-sm leading-snug text-zinc-700">
                <span className="font-semibold text-zinc-900">{s.group}:</span> {s.items.join(", ")}
              </p>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
