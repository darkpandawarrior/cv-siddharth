import { GitBranch, Star, ArrowUpRight, GitPullRequestArrow } from "lucide-react";
import { Reveal } from "./Reveal.tsx";
import { openSource } from "./data/profile.ts";
import { LOOPDOWN_REPO } from "./data/writingMeta.ts";

/**
 * The Source — every public repo behind the work, in one place. The project
 * cards above sell the apps; this sells the engineering surface: real module
 * counts, the shared libraries the apps stand on, the tooling, and the merged
 * upstream PRs. "It's all public" is the whole point — a hiring manager can
 * click straight through to the code.
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

// Curated from the same source-of-truth data the rest of the site reads —
// stats mirror projectStats.ts / the status lines, so nothing here is invented.
const APPS: Repo[] = [
  {
    name: "Mileway",
    path: "darkpandawarrior/Mileway",
    lang: "Kotlin",
    kind: "KMP app · 5 platforms",
    role: "A 5-surface fintech from one Kotlin codebase — sensor-fusion location engine, reimbursement-policy layer, durable submit-outbox and an offline on-device AI assistant.",
    stat: "36 modules · 13 features · 159 tests",
    url: "https://github.com/darkpandawarrior/Mileway",
    accent: "#5ee6ff",
  },
  {
    name: "PaymentsLab",
    path: "darkpandawarrior/PaymentsLab",
    lang: "Kotlin",
    kind: "KMP app · payments",
    role: "A payments lab beyond one-shot pay-in: payouts, mandates, a card vault, marketplace Connect and a double-entry wallet ledger — every rail MOCK_MODE-honest.",
    stat: "39 modules · 71 gateways · 5 rails",
    url: "https://github.com/darkpandawarrior/PaymentsLab",
    accent: "#a78bfa",
  },
  {
    name: "Kursi",
    path: "darkpandawarrior/Kursi",
    lang: "Kotlin",
    kind: "KMP game",
    role: "A deterministic social-deduction engine — one pure (GameState, Intent) → GameState reducer driving ISMCTS bots, the UI and a server, identical on four platforms.",
    stat: "13 modules · 4 platforms · 10 AI personas",
    url: "https://github.com/darkpandawarrior/Kursi",
    accent: "#E8C874",
  },
];

const FOUNDATION: Repo[] = [
  {
    name: "kmp-build-logic",
    path: "darkpandawarrior/kmp-build-logic",
    lang: "Kotlin",
    kind: "Library · build",
    role: "Gradle convention plugins — one place that configures every KMP module's targets, Compose, lint and test wiring.",
    stat: "composite build · Mileway + PaymentsLab",
    url: "https://github.com/darkpandawarrior/kmp-build-logic",
    accent: "#3ddc84",
  },
  {
    name: "kmp-toolkit",
    path: "darkpandawarrior/kmp-toolkit",
    lang: "Kotlin",
    kind: "Library · MVI",
    role: "The (State, Event) → Effects mvi-core base — the reducer/store contract the payments state machine is built on — plus shared feedback modules.",
    stat: "the contract the apps share",
    url: "https://github.com/darkpandawarrior/kmp-toolkit",
    accent: "#3ddc84",
  },
];

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
      className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition hover:-translate-y-0.5"
      style={{ borderColor: undefined }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${r.accent}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={14} style={{ color: r.accent }} className="shrink-0" />
          <span className="truncate font-mono text-sm font-semibold text-zinc-100">{r.path}</span>
        </div>
        <ArrowUpRight size={15} className="shrink-0 text-zinc-600 transition group-hover:text-accent" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-mono text-zinc-400">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: LANG[r.lang] ?? "#8b96a0" }} />
          {r.lang}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-zinc-500">{r.kind}</span>
      </div>
      <p className="mt-3 grow text-sm leading-relaxed text-zinc-400">{r.role}</p>
      <p className="mt-4 font-mono text-[11px]" style={{ color: r.accent }}>
        {r.stat}
      </p>
    </a>
  );
}

function RepoGroup({ label, hint, repos }: { label: string; hint: string; repos: Repo[] }) {
  return (
    <div className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-mono text-xs font-semibold uppercase tracking-widest text-accent/70">{label}</h4>
        <span className="font-mono text-[11px] text-zinc-600">{hint}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((r) => (
          <RepoCard key={r.path} r={r} />
        ))}
      </div>
    </div>
  );
}

export function ReposShowcase() {
  return (
    <Reveal>
      <div id="source" className="mt-14 scroll-mt-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the source</p>
            <h3 className="font-display text-h2 font-bold tracking-tight">It's all public</h3>
            <p className="mt-2 max-w-2xl text-zinc-400">
              Every app, the libraries they share, the tooling, and the upstream PRs — open, and one click away.
              The numbers are pulled from each repo, not typed by hand.
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

        <RepoGroup label="Apps" hint="shipped, end-to-end" repos={APPS} />
        <RepoGroup label="Shared foundation" hint="written once, reused across the apps" repos={FOUNDATION} />
        <RepoGroup label="Tooling & writing" hint="the surrounding surface" repos={TOOLING} />

        <div className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="font-mono text-xs font-semibold uppercase tracking-widest text-accent/70">Merged upstream</h4>
            <span className="font-mono text-[11px] text-zinc-600">career-ops · a public OSS project (⭐60k+)</span>
          </div>
          <ul className="space-y-2">
            {openSource.map((c) => (
              <li key={c.url}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-card px-4 py-2.5 text-sm transition hover:border-accent/50"
                >
                  <GitPullRequestArrow size={14} className="shrink-0 text-accent" />
                  <span className="font-medium text-zinc-200 transition group-hover:text-accent">{c.title}</span>
                  <span className="font-mono text-xs text-zinc-500">{c.repo}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent/80">{c.status}</span>
                    <span className="font-mono text-[11px] text-zinc-600">{c.date}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <a
            href="https://github.com/santifer/career-ops/pulls?q=author%3Adarkpandawarrior"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 transition hover:text-accent"
          >
            <Star size={11} /> all my PRs on career-ops <ArrowUpRight size={11} />
          </a>
        </div>
      </div>
    </Reveal>
  );
}
