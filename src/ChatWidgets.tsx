import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import Markdown, { type Components } from "react-markdown";
import { ArrowRight } from "lucide-react";
import { projectBySlug, metrics, skills, siteRooms, cardMedia, type Project } from "./data/profile.ts";
import { classifyChatHref, useSectionNav } from "./lib/navigation.ts";
import { EMPTY_REPLY_NOTE, parseChatBlocks, type ChatBlock, type JdFitReport } from "./lib/chatBlocks.ts";
import { Picture } from "./Picture.tsx";

/**
 * The generative-UI half of the chat: the components the assistant can drop
 * into its own reply by emitting `[[rooms]]`, `[[project:mileway]]`,
 * `[[metrics]]`, `[[skills]]` or `[[jdfit:{…}]]` (see src/lib/chatBlocks.ts for
 * the parser and the streaming rule that keeps a half-typed directive off the
 * screen).
 *
 * Everything here is sized for the ~370px console panel first — it also has to
 * survive the expanded console and the terminal's inline `ask`, so nothing
 * depends on a fixed width.
 */

const LINK_CLASS = "font-medium text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent";
const TILE_CLASS =
  "block rounded-lg border border-line bg-ink px-2.5 py-2 text-left transition hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none";

/**
 * Renders a link from an assistant reply. Internal targets navigate through the
 * router (SPA, no reload) and close the panel — you asked to be taken
 * somewhere, so the widget gets out of the way. The real `href` is kept on the
 * anchor so hover-preview, copy-link and cmd-click-to-new-tab all still behave
 * like a normal link.
 *
 * Used for both markdown links the model writes and every link inside the
 * widgets below, so there is exactly one navigation implementation in the chat.
 */
export function ChatLink({
  href,
  children,
  onNavigate,
  className = LINK_CLASS,
}: {
  href?: string;
  children?: React.ReactNode;
  onNavigate?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const { goToSection } = useSectionNav();
  const target = href ? classifyChatHref(href) : null;

  if (!target || target.kind === "external")
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let the browser open its new tab/window
        e.preventDefault();
        onNavigate?.();
        if (target.kind === "section") goToSection(target.id);
        else void navigate({ to: target.to });
      }}
    >
      {children}
    </a>
  );
}

/* ── The widgets ─────────────────────────────────────────────────────────── */

function ProjectCard({ project, onNavigate }: { project: Project; onNavigate?: () => void }) {
  const media = cardMedia[project.slug];

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-line bg-ink">
      {media && (
        <div className="h-24 w-full overflow-hidden border-b border-line bg-void">
          {/* Same focal rule as the grid card — this band is even shallower, so
              a wide still cropped from its top would show almost nothing. */}
          <Picture
            src={media.src}
            alt={media.alt}
            className={`h-24 w-full object-cover ${media.focal === "center" ? "object-center" : "object-top"}`}
          />
        </div>
      )}
      <div className="space-y-2 p-3">
        <p className="font-display text-sm font-bold text-zinc-100">{project.name}</p>
        <p className="line-clamp-2 text-xs leading-snug text-zinc-400">{project.tagline}</p>
        <div className="flex flex-wrap gap-1">
          {project.stack.slice(0, 3).map((s) => (
            <span key={s} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-zinc-400">
              {s}
            </span>
          ))}
        </div>
        <p className="font-mono text-[10px] text-muted">{project.status}</p>
        <ChatLink href={`/project/${project.slug}`} onNavigate={onNavigate} className={`${LINK_CLASS} inline-flex items-center gap-1 text-xs no-underline`}>
          open case study <ArrowRight size={12} />
        </ChatLink>
      </div>
    </div>
  );
}

function RoomsGrid({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="my-2.5 grid grid-cols-2 gap-1.5">
      {siteRooms.map((room) => (
        <ChatLink key={room.to} href={room.to} onNavigate={onNavigate} className={TILE_CLASS}>
          <span className="block text-xs font-semibold text-zinc-200">{room.label}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-muted">{room.tag}</span>
        </ChatLink>
      ))}
    </div>
  );
}

function MetricTiles() {
  return (
    <div className="my-2.5 grid grid-cols-2 gap-1.5">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-lg border border-line bg-ink px-2.5 py-2">
          <p className="font-display text-lg font-bold leading-none text-accent">{m.value}</p>
          <p className="mt-1 text-[11px] leading-tight text-zinc-300">{m.label}</p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted">{m.detail}</p>
        </div>
      ))}
    </div>
  );
}

function SkillChips() {
  return (
    <div className="my-2.5 space-y-2">
      {skills.map((group) => (
        <div key={group.group}>
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent2">{group.group}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {group.items.map((item) => (
              <span key={item} className="rounded-full border border-line bg-ink px-2 py-0.5 text-[10px] text-zinc-400">
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── The JD fit scorecard ─────────────────────────────────────────────────
 * The flagship card: a recruiter pastes a job description (`/jd` in the
 * console, mode:"jd" server-side) and this renders the verdict — a score, the
 * requirements that are genuinely covered with the evidence that proves them,
 * and the gaps. The gaps are the point: a fit read that only lists strengths
 * is marketing, and a recruiter can smell it. Everything here comes from a
 * validated payload (parseJdFit) — this component never has to defend itself
 * against a half-streamed or malformed one. */

const BANDS = [
  { min: 80, label: "Strong fit", tone: "text-accent", bar: "bg-accent" },
  { min: 60, label: "Good fit, with gaps", tone: "text-accent2", bar: "bg-accent2" },
  { min: 40, label: "Partial fit", tone: "text-amber-300", bar: "bg-amber-300" },
  { min: 0, label: "Not a match", tone: "text-zinc-300", bar: "bg-zinc-500" },
];

const SECTION_LABEL = "font-mono text-[10px] uppercase tracking-widest";

function JdFitCard({ report, onNavigate }: { report: JdFitReport; onNavigate?: () => void }) {
  const band = BANDS.find((b) => report.score >= b.min)!;

  return (
    <section className="my-2.5 overflow-hidden rounded-xl border border-line bg-ink" aria-label="Job description fit analysis">
      <header className="border-b border-line bg-surface px-3 py-2.5">
        <p className={`${SECTION_LABEL} text-accent2`}>fit analysis</p>
        {report.role && <p className="mt-1 break-words text-xs text-zinc-300">{report.role}</p>}
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`font-display text-2xl font-bold leading-none ${band.tone}`}>{report.score}</span>
          <span className="font-mono text-[10px] text-muted">/ 100</span>
          <span className={`ml-auto text-[11px] font-semibold ${band.tone}`}>{band.label}</span>
        </div>
        {/* Decorative: the number and the band next to it already say this. */}
        <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${report.score}%` }} />
        </div>
      </header>

      <div className="space-y-3 p-3">
        <p className="text-xs leading-snug text-zinc-300">{report.summary}</p>

        {report.strengths.length > 0 && (
          <div>
            <p className={`${SECTION_LABEL} text-accent`}>what matches</p>
            {/* `!` beats the assistant bubble's `[&_ul]:list-disc [&_ul]:pl-4`
                (an element+class selector, so a plain list-none loses to it) —
                these rows carry their own left rule, not markdown bullets. */}
            <ul className="mt-1.5 space-y-2 list-none! pl-0!">
              {report.strengths.map((s, i) => {
                const project = s.project ? projectBySlug(s.project) : undefined;
                return (
                  <li key={i} className="border-l-2 border-accent/40 pl-2">
                    <p className="text-[11px] font-semibold leading-snug text-zinc-200">{s.need}</p>
                    <p className="text-[11px] leading-snug text-zinc-400">{s.evidence}</p>
                    {project && (
                      <ChatLink
                        href={`/project/${project.slug}`}
                        onNavigate={onNavigate}
                        className={`${LINK_CLASS} mt-0.5 inline-flex items-center gap-1 text-[11px] no-underline`}
                      >
                        {project.name} case study <ArrowRight size={11} />
                      </ChatLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <p className={`${SECTION_LABEL} text-amber-300`}>where I'd have gaps</p>
          {report.gaps.length > 0 ? (
            <ul className="mt-1.5 space-y-2 list-none! pl-0!">
              {report.gaps.map((g, i) => (
                <li key={i} className="border-l-2 border-amber-300/40 pl-2">
                  <p className="text-[11px] font-semibold leading-snug text-zinc-200">{g.need}</p>
                  <p className="text-[11px] leading-snug text-zinc-400">{g.note}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              Nothing flagged from the description — ask me directly and I&apos;ll tell you where I&apos;d need ramp-up.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Directive → the component it renders, or null when it resolves to nothing (an
 * unknown name, an invented project slug, a payload that failed validation).
 *
 * A plain function rather than a component, on purpose: ChatMessageBody has to
 * know whether ANYTHING is going to appear, and a component that returns null is
 * indistinguishable from one that doesn't until React renders it. The slug
 * lookup moved up here for the same reason.
 */
function chatWidget(
  block: Extract<ChatBlock, { kind: "widget" }>,
  key: number,
  onNavigate?: () => void,
): React.ReactNode {
  switch (block.name) {
    case "project": {
      // The directive's arg is model output — i.e. attacker-influenceable text.
      // It is never used to build anything; it only ever looks a project up, and
      // an invented slug renders nothing rather than a broken (or forged) card.
      const project = block.arg ? projectBySlug(block.arg) : undefined;
      return project ? <ProjectCard key={key} project={project} onNavigate={onNavigate} /> : null;
    }
    case "rooms":
      return <RoomsGrid key={key} onNavigate={onNavigate} />;
    case "metrics":
      return <MetricTiles key={key} />;
    case "skills":
      return <SkillChips key={key} />;
    case "jdfit":
      return block.data ? <JdFitCard key={key} report={block.data} onNavigate={onNavigate} /> : null;
    default:
      return null;
  }
}

/**
 * One assistant reply: markdown runs rendered as markdown, directives rendered
 * as the real components above. Shared by the console panel and the terminal's
 * inline `ask` so a directive can never leak as raw text on either surface.
 *
 * `done` = the stream has stopped. It buys two things, and both exist because
 * this component rendering NOTHING is a silent failure the visitor can't act on:
 * the parser turns a directive that never completed into an honest note rather
 * than dropping it, and the guard below catches the residue — every block
 * resolving to null (an unknown directive, a made-up slug) — which the parser
 * can't see from a pure string.
 */
export function ChatMessageBody({
  content,
  done = false,
  onNavigate,
}: {
  content: string;
  done?: boolean;
  onNavigate?: () => void;
}) {
  const components = useMemo<Components>(
    () => ({ a: ({ href, children }) => <ChatLink href={href} onNavigate={onNavigate}>{children}</ChatLink> }),
    [onNavigate],
  );
  const blocks = useMemo(() => parseChatBlocks(content, done), [content, done]);

  const nodes = blocks.map((block, i) =>
    block.kind === "text" ? (
      <Markdown key={i} components={components}>
        {block.text}
      </Markdown>
    ) : (
      chatWidget(block, i, onNavigate)
    ),
  );

  if (done && nodes.every((n) => n === null)) return <Markdown components={components}>{EMPTY_REPLY_NOTE}</Markdown>;
  return <>{nodes}</>;
}
