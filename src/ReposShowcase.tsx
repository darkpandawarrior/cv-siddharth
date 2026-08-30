import type { ReactNode } from "react";
import { GitBranch, Star, ArrowUpRight, GitPullRequestArrow } from "lucide-react";
import { Reveal } from "./Reveal.tsx";
import { FoundationGraph } from "./FoundationGraph.tsx";
import { openSource, sharedFoundation } from "./data/profile.ts";
import { LOOPDOWN_REPO } from "./data/writingMeta.ts";

/**
 * The Source: the code under the apps, in one place. The project grid above
 * sells the builds; this sells what they stand on, the shared libraries, the
 * tooling and the merged upstream PRs. "It's all public" is the whole point,
 * a hiring manager can click straight through to the code.
 *
 * THERE IS NO "APPS" GROUP HERE ANY MORE. It carried Mileway, PaymentsLab and
 * Kursi, which are the first three cards of the #projects grid one section up:
 * the same three repositories, in a second card idiom, 1,800px apart. Eight of
 * this page's GitHub URLs appeared exactly twice for that reason. The split is
 * by kind now, #projects is the apps you can run, #source is the code behind
 * them, and every app card up there already links its own repo.
 */

// GitHub-style language dots.
const LANG: Record<string, string> = {
  Kotlin: "#a97bff",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  MDX: "#fcb32c",
};

type Repo = {
  name: string;
  path: string;
  lang: keyof typeof LANG | string;
  kind: string;
  role: string;
  stat: string;
  url: string;
  accent: string;
};

/**
 * Derived from profile.ts's `sharedFoundation.libs`, which already describes
 * these two libraries for the case studies and the assistant. It used to be a
 * fourth hand-typed copy of the same two repos, and the name/role/url in it
 * had to be kept in step with profile.ts by hand — the exact shape of drift
 * this repo keeps rediscovering.
 *
 * The presentation bits a repo card needs and the data does not carry (lang,
 * kind, accent, the one-line stat) stay here, keyed by name, because they are
 * about how a card LOOKS and have no business in profile.ts.
 */
const FOUNDATION_CHROME: Record<string, Pick<Repo, "lang" | "kind" | "stat" | "accent">> = {
  "kmp-build-logic": { lang: "Kotlin", kind: "Library · build", stat: "composite build · Mileway + PaymentsLab", accent: "#3ddc84" },
  "kmp-toolkit": { lang: "Kotlin", kind: "Library · MVI", stat: "the contract the apps share", accent: "#3ddc84" },
};

const FOUNDATION: Repo[] = sharedFoundation.libs.map((lib) => ({
  name: lib.name,
  path: lib.url.replace("https://github.com/", ""),
  role: lib.role,
  url: lib.url,
  ...(FOUNDATION_CHROME[lib.name] ?? { lang: "Kotlin", kind: "Library", stat: "", accent: "#3ddc84" }),
}));

const TOOLING: Repo[] = [
  {
    name: "the-loopdown",
    path: "darkpandawarrior/the-loopdown",
    lang: "MDX",
    kind: "Writing",
    role: "Field notes on the hard parts — the essays behind the case studies, versioned like code.",
    stat: "the story behind the numbers",
    url: LOOPDOWN_REPO,
    accent: "#5ee6ff",
  },
  {
    name: "cv-siddharth",
    path: "darkpandawarrior/cv-siddharth",
    lang: "TypeScript",
    kind: "This site",
    role: "React 19 + Vite + a provider-agnostic LLM chat grounded in this CV — plus every interactive world you're clicking through.",
    stat: "you're looking at it",
    url: "https://github.com/darkpandawarrior/cv-siddharth",
    accent: "#3ddc84",
  },
];

function RepoCard({ r }: { r: Repo }) {
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noreferrer"
      // min-w-0: a grid item's automatic minimum is its min-content width, and
      // `darkpandawarrior/kmp-build-logic` in a nowrap mono span is wider than a
      // 327px column. The card sat 29px outside its own track and the homepage
      // scrolled 5px sideways on a phone — the truncate below never got the
      // chance to fire, because the track was never the constraint.
      className="panel group flex h-full min-w-0 flex-col p-5 transition hover:-translate-y-0.5"
      style={{ borderColor: undefined }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${r.accent}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={14} style={{ color: r.accent }} className="shrink-0" />
          <span className="truncate font-mono text-sm font-semibold text-zinc-100">{r.path}</span>
        </div>
        <ArrowUpRight size={15} className="shrink-0 text-muted transition group-hover:text-accent" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-mono text-zinc-400">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: LANG[r.lang] ?? "#8b96a0" }} />
          {r.lang}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-muted">{r.kind}</span>
      </div>
      <p className="mt-3 grow text-sm leading-relaxed text-zinc-400">{r.role}</p>
      <p className="mt-4 font-mono text-[11px]" style={{ color: r.accent }}>
        {r.stat}
      </p>
    </a>
  );
}

function RepoGroup({ label, hint, repos, intro }: { label: string; hint: string; repos: Repo[]; intro?: ReactNode }) {
  return (
    <div className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="kicker-accent font-semibold">{label}</h4>
        <span className="font-mono text-[11px] text-muted">{hint}</span>
      </div>
      {intro}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((r) => (
          <RepoCard key={r.path} r={r} />
        ))}
      </div>
    </div>
  );
}

/**
 * Promoted from a `<div id="source">` buried near the end of #projects to its
 * own top-level section — the same treatment #shipped already gets right
 * after #projects. #source is a first-class destination in the footer, the
 * command palette and navigation.ts; #projects was 6,423px (eight viewport
 * screens) partly because this sub-section never got promoted out of it.
 */
export function ReposShowcase() {
  return (
    <section id="source" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-eyebrow mb-2">// the source</p>
              <h3 className="font-display text-h2 font-bold tracking-tight">It's all public</h3>
              <p className="mt-2 max-w-2xl text-zinc-400">
                The libraries the apps share, the tooling around them, and the upstream PRs: open,
                and one click away. The numbers are pulled from each repo, not typed by hand.
              </p>
            </div>
            <a
              href="https://github.com/darkpandawarrior"
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-accent hover:text-accent"
            >
              <GitBranch size={14} /> @darkpandawarrior
            </a>
          </div>

          <RepoGroup
            label="Shared foundation"
            hint="written once, reused across the apps"
            repos={FOUNDATION}
            intro={
              /* Moved here from App.tsx, which rendered this blurb and graph
                 under its OWN "Shared foundation" heading immediately above this
                 group's identically-named one. One heading, one block. */
              <div className="panel mb-4 p-6">
                <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{sharedFoundation.blurb}</p>
                <FoundationGraph />
              </div>
            }
          />
          <RepoGroup label="Tooling & writing" hint="the surrounding surface" repos={TOOLING} />

          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h4 className="kicker-accent font-semibold">Merged upstream</h4>
              <span className="font-mono text-[11px] text-muted">career-ops · a public OSS project (⭐63k+)</span>
            </div>
            {/* Six, not all of them. The full list rendered 847px of individual
                PR titles on the homepage — more vertical space than the entire
                Skills section — to make a point ("PRs merged into a public
                project") that the first few make just as well. The rest are one
                click away on GitHub, where they are checkable anyway, which is
                the only place the claim actually settles. */}
            <ul className="space-y-2">
              {openSource.slice(0, 6).map((c) => (
                <li key={c.url}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="panel-sm group flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition hover:border-accent/50"
                  >
                    <GitPullRequestArrow size={14} className="shrink-0 text-accent" />
                    <span className="font-medium text-zinc-200 transition group-hover:text-accent">{c.title}</span>
                    <span className="font-mono text-xs text-muted">{c.repo}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent/80">{c.status}</span>
                      <span className="font-mono text-[11px] text-muted">{c.date}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="https://github.com/santifer/career-ops/pulls?q=author%3Adarkpandawarrior"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted transition hover:text-accent"
            >
              <Star size={11} /> all {openSource.length} of my PRs on career-ops <ArrowUpRight size={11} />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
