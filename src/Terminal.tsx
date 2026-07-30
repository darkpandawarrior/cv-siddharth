import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, TerminalSquare } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSectionNav, classifyHash } from "./lib/navigation.ts";
import {
  profile,
  metrics,
  experience,
  education,
  skills,
  projects,
  caseStudies,
  recentGrowth,
  sharedFoundation,
  openSource,
} from "./data/profile.ts";
import { chess } from "./data/chess.ts";
import { writing } from "./data/writing.ts";
import { RELATED_SERIES } from "./data/connections.ts";
import { titleize } from "./data/writingMeta.ts";
import { projectStats } from "./data/projectStats.ts";
import { openChat } from "./FloatingChat.tsx";
import { ChatMessageBody } from "./ChatWidgets.tsx";
import { chatErrorText, streamReply } from "./lib/chatClient.ts";
import { useLiveSignal } from "./lib/useLiveSignal.ts";
import { SPOTIFY_PREVIEW } from "./lib/spotifyPreview.ts";
import type { SpotifyNow } from "../api/_lib/spotify-handler.ts";
import type { GithubActivity } from "../api/_lib/github-activity-handler.ts";

/**
 * `#terminal` — a faux-shell easter egg that's a real, usable interface.
 *
 * Everything the recruiter can find by scrolling, they can also *type* their
 * way to: `projects`, `open mileway`, `skills`, `cat resume.txt`, `ask <q>`
 * (which hands off to the AI), `hire`. It reads the same `profile.ts` the rest
 * of the site does, so it never drifts. Keyboard-first (history with ↑/↓, Tab
 * completion), theme-swappable, reduced-motion aware, and screen-reader
 * announced via an aria-live log. Type `help` to start.
 */

/* ── Output model ─────────────────────────────────────────────────────────
 * The screen is a list of blocks. A block is either an echoed command line or
 * the ReactNode a command returned. Keeping them as nodes lets commands emit
 * real links / colored spans instead of us re-parsing a string soup. */
type Block = { id: number; kind: "in" | "out"; node: ReactNode };

const PROMPT_USER = "guest";
const PROMPT_HOST = "sid.android";
const HISTORY_KEY = "sid-terminal-history-v1";

/* Themeable accent — `theme <name>` rewrites these on the root terminal node. */
const THEMES: Record<string, { accent: string; dim: string }> = {
  green: { accent: "#3ddc84", dim: "#2bb86c" },
  amber: { accent: "#ffb454", dim: "#d98a2b" },
  cyan: { accent: "#5ee6ff", dim: "#2fb8d6" },
  magenta: { accent: "#ff6ac1", dim: "#d13d97" },
  mono: { accent: "#e8efe9", dim: "#9aa5a0" },
};

const SECTION_ROUTES: Record<string, { hash: string; label: string }> = {
  work: { hash: "#work", label: "Case studies" },
  cases: { hash: "#work", label: "Case studies" },
  projects: { hash: "#projects", label: "Projects" },
  experience: { hash: "#experience", label: "Experience" },
  skills: { hash: "#skills", label: "Skills" },
  writing: { hash: "#writing", label: "Writing" },
  contact: { hash: "#contact", label: "Contact" },
  resume: { hash: "#resume", label: "Résumé" },
  loopdown: { hash: "#loopdown", label: "The Loopdown" },
  blueprint: { hash: "#blueprint", label: "The Blueprint Room" },
  map: { hash: "#map", label: "The 3D Storyboard" },
  lab: { hash: "#lab", label: "The Signal Lab" },
  forge: { hash: "#forge", label: "The Particle Forge" },
  compose: { hash: "#compose", label: "The Compose Playground" },
  chess: { hash: "#chess", label: "The Board" },
  playground: { hash: "#playground", label: "The Playground" },
  source: { hash: "#source", label: "The Source" },
};

/* Small presentational helpers so command output stays declarative. `A` is a
 * real component (not a plain tag) so it can go router-native: external links
 * stay a real <a>, internal `#hash` destinations resolve via classifyHash
 * into a goToSection button or a <Link>. Prop is named `dest`, not `href` —
 * it's a symbolic destination the component classifies, not a literal DOM
 * href (mirrors StoryNode's `target` field in StoryMap.tsx for the same
 * "#hash | url | sentinel" shape). */
function A({ dest, children, ext }: { dest: string; children: ReactNode; ext?: boolean }) {
  const { goToSection } = useSectionNav();
  const cls = "text-[var(--t-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid";
  if (ext) {
    return (
      <a href={dest} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  const c = classifyHash(dest);
  if (c.kind === "section") {
    return (
      <button type="button" onClick={() => goToSection(c.id)} className={cls}>
        {children}
      </button>
    );
  }
  const to = c.kind === "project" ? "/project/$slug" : c.to;
  const params = c.kind === "project" ? { slug: c.slug } : undefined;
  return (
    <Link to={to} params={params} className={cls}>
      {children}
    </Link>
  );
}
const Dim = ({ children }: { children: ReactNode }) => <span className="text-muted">{children}</span>;
const Hi = ({ children }: { children: ReactNode }) => <span className="text-[var(--t-accent)]">{children}</span>;

/* The `chess` command's formatters. Explicit "en-US" for the same reason
 * ChessFindings.tsx uses it: /terminal is server-rendered, and a visitor whose
 * locale groups with "." would hydrate "18.736" over the server's "18,736"
 * and React would throw the tree away. */
const num = (x: number) => x.toLocaleString("en-US");
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

/* The signature — kept ASCII so it renders in the terminal's mono grid. */
const BANNER = String.raw`
   ▄▄▄∙ ▄▄▄  ▄▄▄▄
  ██▀   ██   ██  █    ___________________________
  ▀▀██  ██   ██  █   / prototype  →  platform    /
  ▄▄██∙ ██∙  ██▄▄█  /__________________________ /`;

interface Ctx {
  print: (node: ReactNode) => void;
  clear: () => void;
  setTheme: (name: string) => void;
  runBanner: () => void;
  history: string[];
}

interface Cmd {
  name: string;
  usage?: string;
  help: string;
  hidden?: boolean;
  /** Extra names that dispatch to this same command (e.g. `np` for `spotify`). */
  alias?: string[];
  run: (args: string[], ctx: Ctx) => ReactNode | void | Promise<ReactNode | void>;
}

type Go = (hash: string) => void;

/* ── Command table ───────────────────────────────────────────────────────
 * Ordered roughly by how often a visitor reaches for it. `help` renders from
 * this same list, so a new command is documented the moment it's added. */
function buildCommands(jump: Go): Cmd[] {
  const cmds: Cmd[] = [
    {
      name: "help",
      help: "list everything you can type",
      run: () => (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {cmds
            .filter((c) => !c.hidden)
            .map((c) => (
              <div key={c.name}>
                <Hi>{c.usage ?? c.name}</Hi> <Dim>— {c.help}</Dim>
              </div>
            ))}
          <div className="mt-2 sm:col-span-2">
            <Dim>tip: ↑/↓ history · Tab completes · </Dim>
            <Hi>graph</Hi>
            <Dim> maps the connections · try </Dim>
            <Hi>open mileway</Hi>
            <Dim>, </Dim>
            <Hi>ask how did you cut crashes 80%</Hi>
            <Dim> or </Dim>
            <Hi>hire</Hi>
            <Dim> · press </Dim>
            <kbd className="rounded border border-line px-1 text-[11px]">`</kbd>
            <Dim> anywhere to summon this shell</Dim>
          </div>
        </div>
      ),
    },
    {
      name: "whoami",
      help: "who is this",
      run: () => (
        <div className="space-y-1">
          <div>
            <Hi>{profile.name}</Hi> <Dim>·</Dim> {profile.title}
          </div>
          <div>
            <Dim>{profile.location} · {education.school}</Dim>
          </div>
          <p className="mt-1 max-w-2xl leading-relaxed text-zinc-300">{profile.intro}</p>
          <div className="pt-1">
            <Dim>next: </Dim>
            <Hi>projects</Hi> <Dim>·</Dim> <Hi>skills</Hi> <Dim>·</Dim> <Hi>cases</Hi> <Dim>·</Dim> <Hi>hire</Hi>
          </div>
        </div>
      ),
    },
    {
      name: "about",
      help: "the longer story",
      run: () => (
        <p className="max-w-2xl leading-relaxed text-zinc-300">{profile.summary}</p>
      ),
    },
    {
      name: "ls",
      help: "list files & rooms",
      run: () => {
        const files = ["about.txt", "resume.txt", "stack.txt", "contact.txt", "availability.txt"];
        const rooms = Object.keys(SECTION_ROUTES);
        return (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-x-5 gap-y-0.5">
              {files.map((f) => (
                <span key={f} className="text-[var(--t-accent)]">{f}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {rooms.map((r) => (
                <span key={r} className="text-zinc-400">{r}/</span>
              ))}
            </div>
            <Dim>cat &lt;file&gt; to read · a room name to jump there · projects to list builds</Dim>
          </div>
        );
      },
    },
    {
      name: "cat",
      usage: "cat <file>",
      help: "read about/resume/stack/contact/availability",
      run: (args) => {
        const file = (args[0] ?? "").replace(/\.txt$/, "");
        switch (file) {
          case "about":
            return <p className="max-w-2xl leading-relaxed text-zinc-300">{profile.summary}</p>;
          case "resume":
            return (
              <div className="space-y-1">
                <p className="max-w-2xl leading-relaxed text-zinc-300">{profile.summary}</p>
                <div className="pt-1">
                  <Dim>full résumé (print-ready): </Dim>
                  <A dest="#resume">open resume →</A>
                </div>
              </div>
            );
          case "stack":
            return (
              <div className="space-y-1">
                {skills.map((s) => (
                  <div key={s.group}>
                    <Hi>{s.group.padEnd(22)}</Hi>
                    <Dim>{s.items.join(" · ")}</Dim>
                  </div>
                ))}
              </div>
            );
          case "contact":
            return (
              <div className="space-y-0.5">
                <div><Dim>email  </Dim> <A dest={`mailto:${profile.email}`} ext>{profile.email}</A></div>
                <div><Dim>github </Dim> <A dest={profile.github} ext>{profile.github.replace("https://", "")}</A></div>
                <div><Dim>linked </Dim> <A dest={profile.linkedin} ext>linkedin.com/in/siddharth-pandalai</A></div>
                <div><Dim>where  </Dim> {profile.location}</div>
              </div>
            );
          case "availability":
            return <div className="text-zinc-300">{profile.availability}</div>;
          case "":
            return <Dim>usage: cat &lt;about|resume|stack|contact|availability&gt;.txt</Dim>;
          default:
            return <span className="text-red-400">cat: {args[0]}: No such file. Try `ls`.</span>;
        }
      },
    },
    {
      name: "projects",
      usage: "projects",
      help: "the builds — with slugs for `open`",
      run: () => (
        <div className="space-y-2">
          {projects.map((p) => {
            const st = projectStats[p.slug as keyof typeof projectStats] as { modules?: number } | undefined;
            return (
              <div key={p.slug}>
                <button
                  onClick={() => jump(`#project/${p.slug}`)}
                  className="text-left font-semibold text-[var(--t-accent)] hover:underline"
                >
                  {p.name}
                </button>{" "}
                <Dim>({p.slug})</Dim>
                <div className="text-zinc-400">{p.tagline}</div>
                <Dim>{p.status}{st?.modules ? "" : ""}</Dim>
              </div>
            );
          })}
          <Dim>→ <Hi>open &lt;slug&gt;</Hi> for the full case study, e.g. `open kursi`</Dim>
        </div>
      ),
    },
    {
      name: "open",
      usage: "open <slug>",
      help: "open a project case study",
      run: (args) => {
        const slug = (args[0] ?? "").toLowerCase();
        const p = projects.find((x) => x.slug === slug);
        if (!slug) return <Dim>usage: open &lt;slug&gt; — {projects.map((x) => x.slug).join(", ")}</Dim>;
        if (!p) return <span className="text-red-400">open: no build "{slug}". Try `projects`.</span>;
        jump(`#project/${p.slug}`);
        return (
          <span>
            opening <Hi>{p.name}</Hi> …
          </span>
        );
      },
    },
    {
      name: "skills",
      help: "the tech stack, grouped",
      run: () => (
        <div className="space-y-1.5">
          {skills.map((s) => (
            <div key={s.group}>
              <Hi>{s.group}</Hi>
              <div className="flex flex-wrap gap-x-3 text-zinc-400">
                {s.items.map((it) => (
                  <span key={it}>{it}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "cases",
      usage: "cases",
      help: "case studies — the numbers behind the work",
      run: () => (
        <div className="space-y-2">
          {caseStudies.map((c) => (
            <div key={c.slug}>
              <Hi>{c.metric}</Hi> <Dim>·</Dim> <span className="text-zinc-200">{c.title}</span>
              <div className="text-zinc-400">{c.summary}</div>
            </div>
          ))}
          <Dim>→ ask for depth: <Hi>ask what was the hardest part of the GPS work</Hi></Dim>
        </div>
      ),
    },
    {
      name: "experience",
      help: "career timeline",
      run: () => (
        <div className="space-y-2">
          {experience.map((job) => (
            <div key={job.company}>
              <Hi>{job.role}</Hi> <Dim>@ {job.company}</Dim> <Dim>· {job.period}</Dim>
              <ul className="ml-3 text-zinc-400">
                {job.points.slice(0, 3).map((pt) => (
                  <li key={pt.text}>- {pt.label ? `${pt.label}: ` : ""}{pt.text}</li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <Dim>{education.degree} @ {education.school} · {education.period}</Dim>
          </div>
        </div>
      ),
    },
    {
      name: "metrics",
      usage: "metrics",
      help: "the headline numbers",
      run: () => (
        <div className="space-y-0.5">
          {metrics.map((m) => (
            <div key={m.label}>
              <Hi>{m.value.padEnd(6)}</Hi>
              <span className="text-zinc-300">{m.label}</span> <Dim>— {m.detail}</Dim>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "writing",
      help: "latest field notes",
      run: () => {
        const posts = writing.lessons.filter((l) => l.status === "published").slice(0, 6);
        return (
          <div className="space-y-1">
            {posts.map((p) => (
              <div key={p.slug}>
                {p.live ? <A dest={p.live} ext>{p.title}</A> : <span className="text-zinc-300">{p.title}</span>}
                {p.series && <Dim> · {p.series}</Dim>}
              </div>
            ))}
            <Dim>→ the full hub: <A dest="#loopdown">the loopdown →</A></Dim>
          </div>
        );
      },
    },
    {
      name: "shipped",
      usage: "shipped",
      help: "recently shipped, newest first",
      run: () => (
        <div className="space-y-0.5">
          {recentGrowth.slice(-6).reverse().map((g) => (
            <div key={g.title}>
              <Dim>{g.date}</Dim> <span className="text-zinc-200">{g.title}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "ask",
      usage: "ask <question>",
      help: "ask the AI assistant, answered right here",
      run: (args) => {
        const q = args.join(" ").trim();
        if (!q) {
          openChat();
          return <span>opening <Hi>Panda</Hi>, the AI assistant…</span>;
        }
        // The answer streams into this block — the shell doesn't punt you to
        // the chat panel any more.
        return <AskBlock question={q} />;
      },
    },
    {
      name: "hire",
      help: "the recruiter pitch + how to reach me",
      run: () => (
        <div className="space-y-1">
          <div className="text-zinc-200">
            Senior Android engineer, platform owner at <Hi>50k+ MAU</Hi>. Ships the unglamorous
            reliability work: <Hi>GPS 50%→95%</Hi>, <Hi>-80% crashes</Hi>, <Hi>~87% UI-layer Compose</Hi> across ~960k LOC.
          </div>
          <div className="text-zinc-400">{profile.availability}</div>
          <div className="pt-1">
            <A dest={`mailto:${profile.email}?subject=Senior%20Android%20role`} ext>email me →</A>
            <Dim> · </Dim>
            <A dest="#resume">résumé</A>
            <Dim> · </Dim>
            <button onClick={() => openChat("Why should we hire Siddharth for a senior Android role?")} className="text-[var(--t-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid">ask the AI</button>
          </div>
        </div>
      ),
    },
    {
      name: "email",
      help: "copy my email to the clipboard",
      run: async () => {
        try {
          await navigator.clipboard.writeText(profile.email);
          return <span><Hi>✓ copied</Hi> {profile.email}</span>;
        } catch {
          return <span><A dest={`mailto:${profile.email}`} ext>{profile.email}</A> <Dim>(clipboard unavailable)</Dim></span>;
        }
      },
    },
    {
      name: "social",
      help: "links elsewhere",
      run: () => (
        <div className="space-y-0.5">
          <div><A dest={profile.github} ext>github.com/darkpandawarrior</A></div>
          <div><A dest={profile.linkedin} ext>linkedin.com/in/siddharth-pandalai</A></div>
          <div><A dest="https://dev.to/darkpandawarrior" ext>dev.to/darkpandawarrior</A></div>
        </div>
      ),
    },
    {
      name: "theme",
      usage: "theme <name>",
      help: "recolor the shell (green·amber·cyan·magenta·mono)",
      run: (args, ctx) => {
        const name = (args[0] ?? "").toLowerCase();
        if (!name) return <Dim>usage: theme &lt;{Object.keys(THEMES).join("|")}&gt;</Dim>;
        if (!THEMES[name]) return <span className="text-red-400">theme: unknown "{name}". Options: {Object.keys(THEMES).join(", ")}</span>;
        ctx.setTheme(name);
        return <span>theme → <Hi>{name}</Hi></span>;
      },
    },
    {
      name: "neofetch",
      help: "the system readout",
      run: () => <Neofetch />,
    },
    {
      name: "banner",
      hidden: true,
      help: "reprint the banner",
      run: (_a, ctx) => {
        ctx.runBanner();
      },
    },
    {
      name: "date",
      help: "current date/time",
      run: () => <span>{new Date().toString()}</span>,
    },
    {
      name: "echo",
      usage: "echo <text>",
      hidden: true,
      help: "print text",
      run: (args) => <span>{args.join(" ")}</span>,
    },
    {
      name: "history",
      hidden: true,
      help: "command history",
      run: (_a, ctx) =>
        ctx.history.length ? (
          <div className="space-y-0.5">
            {ctx.history.map((h, i) => (
              <div key={i}>
                <Dim>{String(i + 1).padStart(3)} </Dim>
                {h}
              </div>
            ))}
          </div>
        ) : (
          <Dim>no history yet</Dim>
        ),
    },
    {
      name: "clear",
      help: "clear the screen",
      run: (_a, ctx) => {
        ctx.clear();
      },
    },
    {
      name: "exit",
      usage: "exit",
      help: "back to the portfolio",
      run: () => {
        jump("#top");
        return <span>logging out…</span>;
      },
    },
    {
      name: "graph",
      usage: "graph",
      help: "the synergy map — how the work, apps & writing connect",
      run: () => {
        const foundationUsers = Array.from(new Set(sharedFoundation.libs.flatMap((l) => l.usedBy)));
        return (
          <div className="space-y-2">
            <div>
              <Hi>shared foundation</Hi> <Dim>— written once, reused</Dim>
              {sharedFoundation.libs.map((lib) => (
                <div key={lib.name} className="ml-3">
                  <Dim>└─ </Dim>
                  <A dest={lib.url} ext>{lib.name}</A>
                  <Dim> → {lib.usedBy.join(", ")}</Dim>
                </div>
              ))}
              <div className="ml-3 text-muted">
                so {foundationUsers.join(" & ")} share build wiring + the MVI contract.
              </div>
            </div>
            <div>
              <Hi>work → writing</Hi> <Dim>— the field notes grew out of the work</Dim>
              {Object.entries(RELATED_SERIES).map(([slug, series]) => (
                <div key={slug} className="ml-3">
                  <button onClick={() => jump(`#project/${slug}`)} className="text-zinc-200 hover:text-[var(--t-accent)]">
                    {slug}
                  </button>
                  <Dim> → {series.map(titleize).join(" · ")}</Dim>
                </div>
              ))}
            </div>
            <Dim>every arrow is real. see it drawn: <A dest="#map">3D storyboard</A> · <A dest="#blueprint">blueprint room</A></Dim>
          </div>
        );
      },
    },
    {
      name: "repos",
      usage: "repos",
      help: "the public GitHub repositories",
      run: () => {
        const repos = [
          ...projects.flatMap((p) => p.links.filter((l) => l.url.includes("github.com/")).map((l) => ({ name: p.name, url: l.url }))),
          ...sharedFoundation.libs.map((l) => ({ name: l.name, url: l.url })),
        ];
        const seen = new Set<string>();
        const unique = repos.filter((r) => !seen.has(r.url) && seen.add(r.url));
        return (
          <div className="space-y-0.5">
            {unique.map((r) => (
              <div key={r.url}>
                <Dim>git clone </Dim>
                <A dest={r.url} ext>{r.url.replace("https://github.com/", "")}</A>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      name: "oss",
      usage: "oss",
      help: "merged open-source contributions",
      run: () => (
        <div className="space-y-0.5">
          {openSource.map((c) => (
            <div key={c.url}>
              <Hi>[{c.status}]</Hi> <A dest={c.url} ext>{c.title}</A> <Dim>· {c.repo}</Dim>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "sitemap",
      usage: "sitemap",
      help: "every room in the site",
      run: () => (
        <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {Object.entries(SECTION_ROUTES).map(([k, v]) => (
            <div key={k}>
              <button onClick={() => jump(v.hash)} className="text-left text-[var(--t-accent)] hover:underline">
                {v.hash}
              </button>{" "}
              <Dim>{v.label}</Dim>
            </div>
          ))}
          {projects
            .filter((p) => p.detail)
            .map((p) => (
              <div key={p.slug}>
                <button onClick={() => jump(`#project/${p.slug}`)} className="text-left text-[var(--t-accent)] hover:underline">
                  #project/{p.slug}
                </button>
              </div>
            ))}
        </div>
      ),
    },
    /* ── Easter eggs (hidden from help) ─────────────────────────────────── */
    {
      name: "sudo",
      hidden: true,
      help: "",
      run: (args) => {
        if (args.join(" ").includes("hire")) {
          jump("#contact");
          return <span><Hi>access granted.</Hi> routing you to the hiring channel → <A dest={`mailto:${profile.email}`} ext>{profile.email}</A></span>;
        }
        if (args.join(" ").startsWith("rm")) return <span className="text-red-400">nice try. this shell is read-only — the code is all on <A dest={profile.github} ext>GitHub</A> though.</span>;
        return <Dim>{PROMPT_USER} is not in the sudoers file. This incident will be reported. (try `sudo hire`)</Dim>;
      },
    },
    {
      name: "matrix",
      hidden: true,
      help: "",
      run: () => <span className="text-[var(--t-accent)]">Wake up, Neo… the crashes are down 80%. There is no spoon, only structured concurrency.</span>,
    },
    {
      name: "coffee",
      hidden: true,
      help: "",
      run: () => <span>☕ brewing… <Dim>HTTP 418: I'm a teapot. Ship anyway.</Dim></span>,
    },
    {
      name: "uptime",
      hidden: true,
      help: "",
      run: () => <span>up <Hi>5+ years</Hi>, load average: <Dim>~960k LOC, 50k MAU, 0 dropped pagers</Dim></span>,
    },
    {
      name: "vim",
      hidden: true,
      help: "",
      run: () => <Dim>you're already in the best editor — Android Studio. :q!</Dim>,
    },
    {
      name: "spotify",
      alias: ["np"],
      help: "what I'm listening to",
      run: () => <SpotifyBlock />,
    },
    {
      name: "activity",
      alias: ["gh"],
      help: "recent GitHub activity",
      run: () => <GithubActivityBlock />,
    },
    {
      /* Every figure below reads from the generated `chess.*`. He is still
       * playing — the corpus grew by three games within an hour of first
       * generation — so a literal typed into this file is a number that goes
       * stale on a hiring surface. That includes counts, percentages, ratings,
       * day spans and sample sizes. The generator IS the claim audit here. */
      name: "chess",
      usage: "chess [clock|arc|best]",
      help: "the two-platform game corpus, mined",
      run: (args) => {
        const { totals, span, discipline, thesis, boardTime, platforms, bestUpset } = chess;
        switch ((args[0] ?? "").toLowerCase()) {
          case "clock": {
            const step = 100 / thesis.deciles.length;
            const widest = thesis.deciles.reduce((a, b) => (b.gap > a.gap ? b : a));
            return (
              <div className="space-y-1">
                <div>
                  <Hi>{pct(thesis.lossesOnTime)}</Hi> <span className="text-zinc-300">of losses ended on time</span>{" "}
                  <Dim>·</Dim> <Hi>{pct(thesis.winsOnTime)}</Hi>{" "}
                  <span className="text-zinc-300">of wins came on the opponent&apos;s clock</span>
                </div>
                <div>
                  <Dim>{pct(thesis.decidedOnClock)} of decided games were settled by a clock, not a board.</Dim>
                </div>
                <div className="pt-1">
                  <Dim>mean clock left, by game progress · n={num(thesis.sampleSize)} blitz games with [%clk] traces</Dim>
                </div>
                <div className="grid max-w-sm grid-cols-4 gap-x-3 tabular-nums">
                  <Dim>progress</Dim>
                  <Dim>win</Dim>
                  <Dim>loss</Dim>
                  <Dim>gap</Dim>
                  {thesis.deciles.map((d) => (
                    <Fragment key={d.bucket}>
                      <span className="text-zinc-500">
                        {Math.round(d.bucket * step)}–{Math.round((d.bucket + 1) * step)}%
                      </span>
                      <span className="text-zinc-300">{pct(d.win)}</span>
                      <span className="text-zinc-400">{pct(d.loss)}</span>
                      <Hi>+{(d.gap * 100).toFixed(1)}</Hi>
                    </Fragment>
                  ))}
                </div>
                <Dim>
                  the gap opens early and never closes — widest at {Math.round(widest.bucket * step)}–
                  {Math.round((widest.bucket + 1) * step)}% of the game. Losses are decided in the early middlegame by
                  time spent, not by a late blunder.
                </Dim>
              </div>
            );
          }
          case "arc": {
            // The "not comparable" note names each platform's own best peak
            // rather than a hardcoded pair, so it can never quote a rating the
            // corpus no longer contains.
            const best = platforms.map((p) => ({ id: p.id, peak: p.peaks.reduce((a, b) => (b.rating > a.rating ? b : a)) }));
            return (
              <div className="space-y-1.5">
                {platforms.map((p) => (
                  <div key={p.id}>
                    <Hi>{p.id}</Hi>{" "}
                    <Dim>
                      · {num(p.games)} games · {p.joined} → {p.lastActive}
                    </Dim>
                    <div className="text-zinc-300">
                      {p.peaks.map((k) => `${k.format} ${k.rating}${k.at ? ` (${k.at})` : ""}`).join("  ·  ")}
                    </div>
                    {p.provisional && (
                      <Dim>last ratings, not current — deviation grew back while the account sat idle</Dim>
                    )}
                  </div>
                ))}
                <div>
                  <Dim>
                    not comparable: {best.map((b) => `${b.peak.rating} on ${b.id}`).join(" and ")} sit in different
                    rating pools, not at different strengths. Each arc reads against itself; subtracting one from the
                    other draws a decline the games do not support.
                  </Dim>
                </div>
              </div>
            );
          }
          case "best":
            return (
              <div className="space-y-0.5">
                <div>
                  <Hi>
                    beat {bestUpset.opRating} while rated {bestUpset.myRating}
                  </Hi>{" "}
                  <Dim>— a +{bestUpset.gap} upset</Dim>
                </div>
                <Dim>
                  {bestUpset.at} · {bestUpset.platform} {bestUpset.speed}
                </Dim>
              </div>
            );
          default:
            return (
              <div className="space-y-1">
                <div>
                  <Hi>{num(totals.games)} games</Hi>{" "}
                  <Dim>· {platforms.map((p) => `${p.id} ${num(p.games)}`).join(" · ")}</Dim>
                </div>
                <div>
                  <span className="text-zinc-300">
                    W {num(totals.wins)} · L {num(totals.losses)} · D {num(totals.draws)}
                  </span>
                </div>
                <div>
                  <Dim>
                    {span.from} → {span.to} · played {num(discipline.distinctDays)} of {num(discipline.spanDays)} days (
                    {pct(discipline.distinctDays / discipline.spanDays)})
                  </Dim>
                </div>
                <div>
                  <Hi>~{num(boardTime.combinedHours)}h</Hi>{" "}
                  <Dim>
                    on the board — {num(boardTime.lichessHours)}h lichess self-reported plus{" "}
                    {num(boardTime.chesscomHours)}h derived from chess.com PGN wall clock. Two measurements, not one
                    metric.
                  </Dim>
                </div>
                <div className="space-y-0.5 pt-1">
                  {platforms.map((p) => (
                    <div key={p.id}>
                      <Dim>{p.id}</Dim>{" "}
                      <A dest={p.url} ext>
                        {p.url.replace("https://", "")}
                      </A>
                    </div>
                  ))}
                </div>
                <Dim>
                  → <Hi>chess clock</Hi> the thesis <Dim>·</Dim> <Hi>chess arc</Hi> the ratings <Dim>·</Dim>{" "}
                  <Hi>chess best</Hi> the upset <Dim>·</Dim> <A dest="#chess">the board</A>
                </Dim>
              </div>
            );
        }
      },
    },
    {
      name: "man",
      hidden: true,
      help: "",
      run: (args) => <Dim>man: no manual entry for {args[0] ?? "that"}. This is a portfolio, not GNU. Type `help`.</Dim>,
    },
  ];
  return cmds;
}

/* `ask <question>` renders this: the answer streams into the shell itself
 * instead of punting the visitor to the chat panel. Same src/lib/chatClient.ts
 * the console panel uses (one streaming implementation), and the same
 * ChatMessageBody — so a `[[project:mileway]]` card the model emits renders
 * here too rather than leaking as raw text. Bare `ask` still opens the panel. */
function AskBlock({ question }: { question: string }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    // Reset first: a re-run of this effect (React's dev double-invoke, HMR)
    // must restart the answer, not append a second copy on top of the first.
    setText("");
    streamReply([{ role: "user", content: question }], (delta) => {
      if (live) setText((t) => t + delta);
    })
      .catch((err) => live && setText(chatErrorText(err)))
      .finally(() => live && setDone(true));
    return () => {
      live = false;
    };
  }, [question]);

  return (
    <div className="my-1 border-l-2 border-[var(--t-accent)]/40 pl-3">
      <div>
        <Hi>sid</Hi> <Dim>·</Dim> <span className="text-zinc-300">“{question}”</span>
      </div>
      {/* The whole output log is an aria-live region; a token-by-token stream
          inside it would be announced dozens of times. Muted while streaming,
          handed back to the log once the answer has settled. */}
      <div
        aria-live={done ? "polite" : "off"}
        className={`max-w-2xl leading-relaxed text-zinc-200 [&_a]:text-[var(--t-accent)] [&_strong]:text-[var(--t-accent)] [&_ul]:list-disc [&_ul]:pl-4 ${
          done ? "" : "chat-streaming"
        }`}
      >
        {/* Same blank-output hole the console panel had: `text` can be entirely
            a directive that never closed, which renders to nothing — and an
            empty answer that never arrived would sit on "thinking…" forever.
            Once `done`, ChatMessageBody always renders something (see its
            `done` prop); until then, the spinner. */}
        {!done && !text ? <Dim>thinking…</Dim> : <ChatMessageBody content={text} done={done} />}
      </div>
    </div>
  );
}

/* `spotify`/`np` renders this: live now-playing, falling back to the most
 * recently played track. Same useLiveSignal hook the footer chip uses. */
function SpotifyBlock() {
  const { data } = useLiveSignal<SpotifyNow>("/api/spotify");
  if (!data) return <Dim>reading now-playing…</Dim>;
  if (!data.connected) {
    return (
      <div>
        <Dim>spotify: not connected. preview:</Dim>
        <div>
          · {SPOTIFY_PREVIEW.track} — {SPOTIFY_PREVIEW.artist} <Dim>(mock)</Dim>
        </div>
      </div>
    );
  }
  if (data.isPlaying) {
    return (
      <span>
        ▶ <Hi>{data.track}</Hi> — {data.artist}
      </span>
    );
  }
  if (data.recent.length === 0) return <Dim>nothing recent</Dim>;
  return (
    <div>
      <Dim>not playing. recent:</Dim>
      {data.recent.map((t, i) => (
        <div key={i}>· {t.track} — {t.artist}</div>
      ))}
    </div>
  );
}

/* `activity`/`gh` renders this: live recent GitHub events. */
function GithubActivityBlock() {
  const { data } = useLiveSignal<GithubActivity>("/api/github-activity");
  if (!data) return <Dim>reading github activity…</Dim>;
  if (!data.connected || data.items.length === 0) return <Dim>no recent activity</Dim>;
  return (
    <div>
      {data.items.map((it, i) => (
        <div key={i}>· [{it.repo.split("/")[1]}] {it.message}</div>
      ))}
    </div>
  );
}

/* neofetch-style two-column readout, sourced live from profile data. */
function Neofetch() {
  const rows: [string, ReactNode][] = [
    ["role", profile.title],
    ["host", `${PROMPT_USER}@${PROMPT_HOST}`],
    ["location", profile.location],
    ["uptime", "5+ years in production Android"],
    ["kernel", "Kotlin · Jetpack Compose · KMP"],
    ["scale", `${metrics[0].value} MAU · ~960k LOC`],
    ["gps", "50% → 95% accuracy"],
    ["crashes", "-80% (structured concurrency)"],
    ["compose", "~87% of UI-layer code (455k of 523k LOC)"],
    ["builds", projects.map((p) => p.name).join(" · ")],
  ];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <pre className="shrink-0 whitespace-pre text-[10px] leading-tight text-[var(--t-accent)] sm:text-xs">{BANNER}</pre>
      <div className="min-w-0 space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <Hi>{k.padEnd(9)}</Hi>
            <span className="text-zinc-300">{v}</span>
          </div>
        ))}
        <div className="pt-1">
          {Object.keys(THEMES).map((t) => (
            <span key={t} className="mr-1 inline-block h-3 w-6 rounded-sm align-middle" style={{ background: THEMES[t].accent }} />
          ))}
        </div>
      </div>
    </div>
  );
}

let blockId = 0;

export function Terminal() {
  const navigate = useNavigate();
  const { goToSection } = useSectionNav();
  // Router-native replacement for the old bare-hash-assignment helper: used
  // both by commands (open/exit/sudo hire/graph/sitemap) and by the bare
  // room-name dispatch in `run()` below. Classifies via the same classifyHash
  // shared with every other file's internal-nav conversion, so it can't drift.
  const jump = useCallback<Go>(
    (hash: string) => {
      const c = classifyHash(hash);
      if (c.kind === "section") { goToSection(c.id); return; }
      if (c.kind === "project") { navigate({ to: "/project/$slug", params: { slug: c.slug } }); return; }
      navigate({ to: c.to });
    },
    [navigate, goToSection],
  );
  const commands = useMemo(() => buildCommands(jump), [jump]);
  const cmdMap = useMemo(() => {
    const map = new Map<string, Cmd>();
    for (const c of commands) {
      map.set(c.name, c);
      for (const a of c.alias ?? []) map.set(a, c);
    }
    return map;
  }, [commands]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [histCursor, setHistCursor] = useState<number | null>(null);
  const [ghost, setGhost] = useState(""); // inline autocomplete preview
  const scrollRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useRef(false);

  const push = useCallback((kind: Block["kind"], node: ReactNode) => {
    setBlocks((b) => [...b, { id: blockId++, kind, node }]);
  }, []);

  const setTheme = useCallback((name: string) => {
    const t = THEMES[name] ?? THEMES.green;
    const el = rootRef.current;
    if (el) {
      el.style.setProperty("--t-accent", t.accent);
      el.style.setProperty("--t-dim", t.dim);
    }
    try {
      localStorage.setItem("sid-terminal-theme", name);
    } catch {
      /* ignore */
    }
  }, []);

  const runBanner = useCallback(() => {
    push("out", <Neofetch />);
    push(
      "out",
      <Dim>
        Type <Hi>help</Hi> to list commands · <Hi>projects</Hi> to see the builds · <Hi>exit</Hi> to leave.
      </Dim>,
    );
  }, [push]);

  /* Boot once: theme, banner, and a short typed sequence (skipped on reduced motion). */
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const savedTheme = (() => {
      try {
        return localStorage.getItem("sid-terminal-theme") ?? "green";
      } catch {
        return "green";
      }
    })();
    setTheme(savedTheme);

    const boot = ["booting sid.android shell…", "mounting /profile … ok", "loading builds, writing, metrics … ok", "ready."];
    if (reduce.current) {
      boot.forEach((l) => push("out", <Dim>{l}</Dim>));
      runBanner();
      return;
    }
    let i = 0;
    const timers: number[] = [];
    const step = () => {
      if (i < boot.length) {
        push("out", <Dim>{boot[i]}</Dim>);
        i++;
        timers.push(window.setTimeout(step, 260));
      } else {
        runBanner();
      }
    };
    timers.push(window.setTimeout(step, 200));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [blocks]);

  // Keep the input focused; clicking anywhere (that isn't a link/button) refocuses.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const complete = useCallback(
    (prefix: string) => {
      const [head] = prefix.split(" ");
      if (prefix.includes(" ")) {
        // second-token completion for `open <slug>` / `cat <file>` / `theme <name>`
        const rest = prefix.slice(head.length + 1);
        let pool: string[] = [];
        if (head === "open") pool = projects.map((p) => p.slug);
        else if (head === "cat") pool = ["about.txt", "resume.txt", "stack.txt", "contact.txt", "availability.txt"];
        else if (head === "theme") pool = Object.keys(THEMES);
        const hit = pool.find((p) => p.startsWith(rest));
        return hit ? `${head} ${hit}` : prefix;
      }
      const hit = commands.filter((c) => !c.hidden).find((c) => c.name.startsWith(head));
      return hit ? hit.name : prefix;
    },
    [commands],
  );

  // Ghost autocomplete preview mirrors what Tab would fill.
  useEffect(() => {
    if (!value.trim()) {
      setGhost("");
      return;
    }
    const c = complete(value);
    setGhost(c !== value && c.startsWith(value) ? c.slice(value.length) : "");
  }, [value, complete]);

  const run = useCallback(
    async (raw: string) => {
      const line = raw.trim();
      push("in", <PromptLine text={raw} />);
      if (line) {
        setHistory((h) => {
          const next = [...h.filter((x) => x !== line), line].slice(-100);
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
      setHistCursor(null);
      if (!line) return;

      // A bare room name jumps there — `projects`, `resume`, `blueprint`, …
      const [name, ...args] = line.split(/\s+/);
      const lname = name.toLowerCase();
      const cmd = cmdMap.get(lname);
      if (cmd) {
        const ctx: Ctx = { print: (n) => push("out", n), clear: () => setBlocks([]), setTheme, runBanner, history };
        const out = await cmd.run(args, ctx);
        if (out !== undefined && out !== null) push("out", out);
        return;
      }
      if (SECTION_ROUTES[lname]) {
        jump(SECTION_ROUTES[lname].hash);
        push("out", <span>→ {SECTION_ROUTES[lname].label}</span>);
        return;
      }
      push("out", <span className="text-red-400">{name}: command not found. Type <Hi>help</Hi>.</span>);
    },
    [cmdMap, history, push, runBanner, setTheme, jump],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = value;
      setValue("");
      setGhost("");
      void run(v);
    } else if (e.key === "Tab" && complete(value) !== value) {
      e.preventDefault();
      setValue(complete(value));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = histCursor === null ? history.length - 1 : Math.max(0, histCursor - 1);
      setHistCursor(next);
      setValue(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histCursor === null) return;
      const next = histCursor + 1;
      if (next >= history.length) {
        setHistCursor(null);
        setValue("");
      } else {
        setHistCursor(next);
        setValue(history[next]);
      }
    } else if (e.key === "ArrowRight" && ghost) {
      // accept ghost completion (like a shell) when caret is at the end
      const el = e.currentTarget;
      if (el.selectionStart === value.length) {
        e.preventDefault();
        setValue(value + ghost);
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      setBlocks([]);
    } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      setValue("");
      setGhost("");
      push("in", <PromptLine text={`${value}^C`} />);
    }
  };

  return (
    <div
      ref={rootRef}
      className="term-root relative flex h-screen flex-col bg-void font-mono text-[13px] text-zinc-200 sm:text-sm"
      style={{ ["--t-accent" as string]: "#3ddc84", ["--t-dim" as string]: "#2bb86c" }}
      onClick={(e) => {
        // Don't steal focus from links/buttons the user is clicking.
        if ((e.target as HTMLElement).closest("a,button")) return;
        inputRef.current?.focus();
      }}
    >
      <div className="term-scanlines pointer-events-none absolute inset-0 z-0" aria-hidden />
      {/* Title bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-line bg-ink/80 px-4 py-2.5 backdrop-blur">
        <button type="button" onClick={() => goToSection("top")} className="flex items-center gap-2 text-xs text-zinc-400 transition hover:text-[var(--t-accent)]">
          <ArrowLeft size={14} /> <span className="hidden sm:inline">Back to portfolio</span>
        </button>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
          <TerminalSquare size={13} className="text-[var(--t-accent)]" />
          {PROMPT_USER}@{PROMPT_HOST} — /bin/sh
        </span>
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-zinc-600" />
          <span className="h-3 w-3 rounded-full bg-zinc-600" />
          <span className="h-3 w-3 rounded-full" style={{ background: "var(--t-accent)" }} />
        </span>
      </header>

      {/* Output log */}
      <main
        id="main-content"
        tabIndex={-1}
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        aria-live="polite"
        aria-label="terminal output"
      >
        <h1 className="sr-only">The Terminal — a faux shell you can type in</h1>
        <div className="mx-auto max-w-4xl space-y-1.5">
          {blocks.map((b) => (
            <div key={b.id} className={reduce.current ? "" : "term-line"}>
              {b.node}
            </div>
          ))}
          {/* Live input line */}
          <div className="flex items-center">
            <Caret />
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-label="terminal input — type help"
                className="w-full bg-transparent text-zinc-100 caret-[var(--t-accent)] outline-none"
              />
              {ghost && (
                <span className="pointer-events-none absolute left-0 top-0 whitespace-pre text-muted">
                  <span className="invisible">{value}</span>
                  {ghost}
                </span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PromptLine({ text }: { text: string }) {
  return (
    <div className="flex">
      <Caret />
      <span className="whitespace-pre-wrap break-words text-zinc-300">{text}</span>
    </div>
  );
}

function Caret() {
  return (
    <span className="mr-2 shrink-0 select-none whitespace-pre">
      <span className="text-[var(--t-accent)]">{PROMPT_USER}@{PROMPT_HOST}</span>
      <span className="text-muted">:~$</span>
    </span>
  );
}
