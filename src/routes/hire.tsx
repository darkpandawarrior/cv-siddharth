import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, FileText, Mail, Github, Linkedin } from "lucide-react";
import { profile, metrics, caseStudies, projects } from "../data/profile.ts";
import { roomHead } from "../lib/routeHead.ts";

/**
 * /hire — the ninety-second surface.
 *
 * Nine independent models, asked to find the cheapest change that would move a
 * hiring decision more than a full re-theme, converged on the same answer: one
 * dense page with the numbers, the résumé and a way to make contact, and
 * nothing else. It is the only page here designed for someone who does not
 * want to explore.
 *
 * Rules this page holds itself to, because they are the entire point:
 *  - Everything that matters is above the fold at 1280x800 and on a phone.
 *  - No canvas, no three.js, no scroll-driven anything. It must paint instantly.
 *  - Exactly one idea per row, biggest number first.
 *  - Every claim is a link to the thing that proves it.
 *
 * The closing paragraph states the fact and stops. Two separate model
 * ensembles disagreed about the site's narrative: one said never explain it,
 * the other said burying it entirely wastes the strongest thread. The first
 * one won. Naming the connection in copy hands the reader the conclusion they
 * were about to reach on their own, which is the one move that makes it read
 * as a theme rather than as how he works. The link to the other half is left
 * where a reader who wants it will find it, and the structure carries the
 * rest.
 */
export const Route = createFileRoute("/hire")({
  head: () => roomHead("/hire"),
  component: HirePage,
});

// The three that answer "can he own a platform", in the order a hiring manager
// asks them: scale, then a hard technical win, then reliability.
const HEADLINE = metrics.slice(0, 3);

function HirePage() {
  const featured = caseStudies.slice(0, 3);
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-ink">
      <div className="mx-auto max-w-4xl px-6 section-y">
        {/* The role used to hang off the name in the <h1> behind an em dash,
            which is a punctuation mark this site's prose does not use. It also
            made the largest line on the page two ideas wide. The kicker was
            already the line that says where he is and how he works, so the
            role joins it there and the heading is left holding the one thing
            a recruiter came to read. */}
        <p className="kicker-accent">
          {profile.title} · {profile.location} · open to remote
        </p>
        <h1 className="font-display mt-3 text-hero font-bold tracking-tight text-balance">
          {profile.name}
        </h1>
        {/* "Five years" read as an exact figure and was the only surface
            spelling it out, so it could not be found by the same grep that
            finds the other ten. The hedge every other surface uses is a lower
            bound, which is the one direction a hiring page may drift. It is
            still hand-typed: the real fix is one anchor date in profile.ts,
            interpolated everywhere, and that lives outside this file. */}
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300">
          Platform owner of a ~964k-LOC financial SaaS app serving 50,000+ monthly users. 5+ years of
          Android, now building across Kotlin Multiplatform.
        </p>

        {/* The numbers, before anything else asks for attention. */}
        <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {HEADLINE.map((m) => (
            <div key={m.label} className="bg-card p-5">
              <dt className="sr-only">{m.label}</dt>
              <dd>
                <span className="font-display block text-metric font-bold text-accent">{m.value}</span>
                <span className="mt-1 block text-sm font-semibold text-zinc-200">{m.label}</span>
                <span className="mt-1.5 block text-xs leading-snug text-muted">{m.detail}</span>
              </dd>
            </div>
          ))}
        </dl>

        {/* The two actions. Everything else on this page is evidence for them. */}
        <div className="mt-8 flex flex-wrap gap-3">
          {/* max-w-full + break-all: the address is 29 unbreakable characters
              and the pill around it is ~364px, so on a 320px window the primary
              call to action on the hiring page had its last few characters cut
              off — html{overflow-x:hidden} clips rather than scrolls, so there
              was no way to see the rest of it. */}
          <a
            href={`mailto:${profile.email}`}
            className="flex max-w-full items-center gap-2 break-all rounded-full bg-accent px-6 py-3 font-semibold text-ink transition hover:bg-accent-dim"
          >
            <Mail size={17} className="shrink-0" /> {profile.email}
          </a>
          <Link
            to="/resume"
            className="flex items-center gap-2 rounded-full border border-line px-6 py-3 font-semibold text-zinc-100 transition hover:border-accent hover:text-accent"
          >
            <FileText size={17} /> Résumé
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">{profile.availability}</p>

        {/* Three case studies, one line each. A hiring manager who wants depth
            clicks; one who does not has already got what they came for. */}
        <div className="mt-12 border-t border-line pt-8">
          <p className="kicker">The work behind the numbers</p>
          <ul className="mt-4 divide-y divide-line">
            {featured.map((c) => {
              // A case study is not always a project. `mileway` is both and has
              // a full detail page; `gps-accuracy` and `crash-reduction` exist
              // only in `caseStudies`, and linking them to /project/$slug sent
              // two of the three links on this page — the page a recruiter is
              // handed — to a 404. The homepage renders every case study with
              // its slug as an anchor, so this fallback can never miss.
              const detail = projects.some((p) => p.slug === c.slug);
              const linkProps = detail
                ? ({ to: "/project/$slug", params: { slug: c.slug } } as const)
                : ({ to: "/", hash: c.slug } as const);
              return (
              <li key={c.slug}>
                <Link
                  {...linkProps}
                  className="group flex items-baseline justify-between gap-4 py-3.5"
                >
                  <span>
                    {/* CaseStudy.title is the full descriptive line ("Mileway —
                        offline-first mileage tracker (Android · iOS · …)").
                        On a scan-in-90-seconds page that is a paragraph, so the
                        name leads and the metric carries the proof. */}
                    <span className="font-display text-base font-bold transition group-hover:text-accent">
                      {c.title.split(" — ")[0]}
                    </span>
                    <span className="ml-2 font-mono text-xs text-muted">{c.metric}</span>
                  </span>
                  <ArrowUpRight
                    size={15}
                    className="shrink-0 text-muted transition group-hover:text-accent"
                  />
                </Link>
              </li>
              );
            })}
          </ul>
        </div>

        {/* The fact, and only the fact. This used to continue "I do the same
            thing to sensor data now", which drew the line between the editing
            years and the engineering for the reader. That is the one thing the
            site must never do in copy: the connection is left for the reader to
            make, or it is not made at all. The link does the work instead. */}
        <p className="mt-10 max-w-2xl border-l-2 border-accent/40 pl-4 leading-relaxed text-zinc-300">
          Before I wrote software I spent three years editing a college magazine, finding what was
          wrong in other people's drafts.{" "}
          <Link to="/ink" className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent">
            That half is here too
          </Link>
          .
        </p>

        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm">
          <Link to="/" className="text-zinc-400 transition hover:text-accent">
            Full portfolio →
          </Link>
          <a href={profile.github} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-zinc-400 transition hover:text-accent">
            <Github size={14} /> GitHub
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-zinc-400 transition hover:text-accent">
            <Linkedin size={14} /> LinkedIn
          </a>
        </div>
      </div>
    </main>
  );
}
