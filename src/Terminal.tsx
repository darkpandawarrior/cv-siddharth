import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, TerminalSquare } from "lucide-react";
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
import { writing } from "./data/writing.ts";
import { RELATED_SERIES } from "./data/connections.ts";
import { titleize } from "./data/writingMeta.ts";
import { projectStats } from "./data/projectStats.ts";
import { openChat } from "./FloatingChat.tsx";

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
  playground: { hash: "#playground", label: "The Playground" },
  source: { hash: "#source", label: "The Source" },
};

/* Small presentational helpers so command output stays declarative. */
function A({ href, children, ext }: { href: string; children: ReactNode; ext?: boolean }) {
  return (
    <a
      href={href}
      target={ext ? "_blank" : undefined}
      rel={ext ? "noreferrer" : undefined}
      className="text-[var(--t-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {children}
    </a>
  );
}
const Dim = ({ children }: { children: ReactNode }) => <span className="text-zinc-500">{children}</span>;
const Hi = ({ children }: { children: ReactNode }) => <span className="text-[var(--t-accent)]">{children}</span>;

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
  run: (args: string[], ctx: Ctx) => ReactNode | void | Promise<ReactNode | void>;
}

function go(hash: string) {
  const isSection = !!document.getElementById(hash.slice(1));
  window.location.hash = hash;
  if (!isSection) window.scrollTo({ top: 0 });
}

/* ── Command table ───────────────────────────────────────────────────────
 * Ordered roughly by how often a visitor reaches for it. `help` renders from
 * this same list, so a new command is documented the moment it's added. */
function buildCommands(): Cmd[] {
  const cmds: Cmd[] = [
    {
      name: "help",
      help: "list everything you can type",
      run: (_a, _c) => (
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
                  <A href="#resume">open resume →</A>
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
                <div><Dim>email  </Dim> <A href={`mailto:${profile.email}`} ext>{profile.email}</A></div>
                <div><Dim>github </Dim> <A href={profile.github} ext>{profile.github.replace("https://", "")}</A></div>
                <div><Dim>linked </Dim> <A href={profile.linkedin} ext>linkedin.com/in/siddharth-pandalai</A></div>
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
                  onClick={() => go(`#project/${p.slug}`)}
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
        go(`#project/${p.slug}`);
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
                {p.live ? <A href={p.live} ext>{p.title}</A> : <span className="text-zinc-300">{p.title}</span>}
                {p.series && <Dim> · {p.series}</Dim>}
              </div>
            ))}
            <Dim>→ the full hub: <A href="#loopdown">the loopdown →</A></Dim>
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
      help: "ask the AI assistant (it has read all of this)",
      run: (args) => {
        const q = args.join(" ").trim();
        if (!q) {
          openChat();
          return <span>opening <Hi>Sid</Hi>, the AI assistant…</span>;
        }
        openChat(q);
        return (
          <span>
            asking <Hi>Sid</Hi>: <span className="text-zinc-300">“{q}”</span> … <Dim>(see the chat panel)</Dim>
          </span>
        );
      },
    },
    {
      name: "hire",
      help: "the recruiter pitch + how to reach me",
      run: () => (
        <div className="space-y-1">
          <div className="text-zinc-200">
            Senior Android engineer, platform owner at <Hi>50k+ MAU</Hi>. Ships the unglamorous
            reliability work: <Hi>GPS 50%→95%</Hi>, <Hi>-80% crashes</Hi>, <Hi>92% Compose</Hi> across 738k LOC.
          </div>
          <div className="text-zinc-400">{profile.availability}</div>
          <div className="pt-1">
            <A href={`mailto:${profile.email}?subject=Senior%20Android%20role`} ext>email me →</A>
            <Dim> · </Dim>
            <A href="#resume">résumé</A>
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
          return <span><A href={`mailto:${profile.email}`} ext>{profile.email}</A> <Dim>(clipboard unavailable)</Dim></span>;
        }
      },
    },
    {
      name: "social",
      help: "links elsewhere",
      run: () => (
        <div className="space-y-0.5">
          <div><A href={profile.github} ext>github.com/darkpandawarrior</A></div>
          <div><A href={profile.linkedin} ext>linkedin.com/in/siddharth-pandalai</A></div>
          <div><A href="https://dev.to/darkpandawarrior" ext>dev.to/darkpandawarrior</A></div>
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
        go("#top");
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
                  <A href={lib.url} ext>{lib.name}</A>
                  <Dim> → {lib.usedBy.join(", ")}</Dim>
                </div>
              ))}
              <div className="ml-3 text-zinc-500">
                so {foundationUsers.join(" & ")} share build wiring + the MVI contract.
              </div>
            </div>
            <div>
              <Hi>work → writing</Hi> <Dim>— the field notes grew out of the work</Dim>
              {Object.entries(RELATED_SERIES).map(([slug, series]) => (
                <div key={slug} className="ml-3">
                  <button onClick={() => go(`#project/${slug}`)} className="text-zinc-200 hover:text-[var(--t-accent)]">
                    {slug}
                  </button>
                  <Dim> → {series.map(titleize).join(" · ")}</Dim>
                </div>
              ))}
            </div>
            <Dim>every arrow is real. see it drawn: <A href="#map">3D storyboard</A> · <A href="#blueprint">blueprint room</A></Dim>
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
                <A href={r.url} ext>{r.url.replace("https://github.com/", "")}</A>
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
              <Hi>[{c.status}]</Hi> <A href={c.url} ext>{c.title}</A> <Dim>· {c.repo}</Dim>
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
              <button onClick={() => go(v.hash)} className="text-left text-[var(--t-accent)] hover:underline">
                {v.hash}
              </button>{" "}
              <Dim>{v.label}</Dim>
            </div>
          ))}
          {projects
            .filter((p) => p.detail)
            .map((p) => (
              <div key={p.slug}>
                <button onClick={() => go(`#project/${p.slug}`)} className="text-left text-[var(--t-accent)] hover:underline">
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
          go("#contact");
          return <span><Hi>access granted.</Hi> routing you to the hiring channel → <A href={`mailto:${profile.email}`} ext>{profile.email}</A></span>;
        }
        if (args.join(" ").startsWith("rm")) return <span className="text-red-400">nice try. this shell is read-only — the code is all on <A href={profile.github} ext>GitHub</A> though.</span>;
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
      run: () => <span>up <Hi>5+ years</Hi>, load average: <Dim>738k LOC, 50k MAU, 0 dropped pagers</Dim></span>,
    },
    {
      name: "vim",
      hidden: true,
      help: "",
      run: () => <Dim>you're already in the best editor — Android Studio. :q!</Dim>,
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

/* neofetch-style two-column readout, sourced live from profile data. */
function Neofetch() {
  const rows: [string, ReactNode][] = [
    ["role", profile.title],
    ["host", `${PROMPT_USER}@${PROMPT_HOST}`],
    ["location", profile.location],
    ["uptime", "5+ years in production Android"],
    ["kernel", "Kotlin · Jetpack Compose · KMP"],
    ["scale", `${metrics[0].value} MAU · 738k LOC`],
    ["gps", "50% → 95% accuracy"],
    ["crashes", "-80% (structured concurrency)"],
    ["compose", "92% of the codebase"],
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
  const commands = useMemo(buildCommands, []);
  const cmdMap = useMemo(() => new Map(commands.map((c) => [c.name, c])), [commands]);
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
  const scrollRef = useRef<HTMLDivElement>(null);
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
        go(SECTION_ROUTES[lname].hash);
        push("out", <span>→ {SECTION_ROUTES[lname].label}</span>);
        return;
      }
      push("out", <span className="text-red-400">{name}: command not found. Type <Hi>help</Hi>.</span>);
    },
    [cmdMap, history, push, runBanner, setTheme],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = value;
      setValue("");
      setGhost("");
      void run(v);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const c = complete(value);
      setValue(c);
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
        <a href="#top" className="flex items-center gap-2 text-xs text-zinc-400 transition hover:text-[var(--t-accent)]">
          <ArrowLeft size={14} /> <span className="hidden sm:inline">Back to portfolio</span>
        </a>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
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
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite" aria-label="terminal output">
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
                <span className="pointer-events-none absolute left-0 top-0 whitespace-pre text-zinc-600">
                  <span className="invisible">{value}</span>
                  {ghost}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
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
      <span className="text-zinc-500">:~$</span>
    </span>
  );
}
