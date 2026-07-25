import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import Markdown, { type Components } from "react-markdown";
import { ArrowRight } from "lucide-react";
import { projects, metrics, skills, siteRooms, cardMedia } from "./data/profile.ts";
import { classifyChatHref, useSectionNav } from "./lib/navigation.ts";
import { parseChatBlocks } from "./lib/chatBlocks.ts";
import { Picture } from "./Picture.tsx";

/**
 * The generative-UI half of the chat: the components the assistant can drop
 * into its own reply by emitting `[[rooms]]`, `[[project:mileway]]`,
 * `[[metrics]]` or `[[skills]]` (see src/lib/chatBlocks.ts for the parser and
 * the streaming rule that keeps a half-typed directive off the screen).
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

function ProjectCard({ slug, onNavigate }: { slug: string; onNavigate?: () => void }) {
  const project = projects.find((p) => p.slug === slug);
  if (!project) return null; // an invented slug renders nothing rather than a broken card
  const media = cardMedia[project.slug];

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-line bg-ink">
      {media && (
        <div className="h-24 w-full overflow-hidden border-b border-line bg-void">
          <Picture src={media.src} alt={media.alt} className="h-24 w-full object-cover object-top" />
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

/** Directive → component. An unknown name (or a made-up slug) renders nothing. */
function ChatWidget({ name, arg, onNavigate }: { name: string; arg?: string; onNavigate?: () => void }) {
  switch (name) {
    case "project":
      return arg ? <ProjectCard slug={arg} onNavigate={onNavigate} /> : null;
    case "rooms":
      return <RoomsGrid onNavigate={onNavigate} />;
    case "metrics":
      return <MetricTiles />;
    case "skills":
      return <SkillChips />;
    default:
      return null;
  }
}

/**
 * One assistant reply: markdown runs rendered as markdown, directives rendered
 * as the real components above. Shared by the console panel and the terminal's
 * inline `ask` so a directive can never leak as raw text on either surface.
 */
export function ChatMessageBody({ content, onNavigate }: { content: string; onNavigate?: () => void }) {
  const components = useMemo<Components>(
    () => ({ a: ({ href, children }) => <ChatLink href={href} onNavigate={onNavigate}>{children}</ChatLink> }),
    [onNavigate],
  );
  const blocks = useMemo(() => parseChatBlocks(content), [content]);

  return (
    <>
      {blocks.map((block, i) =>
        block.kind === "text" ? (
          <Markdown key={i} components={components}>
            {block.text}
          </Markdown>
        ) : (
          <ChatWidget key={i} name={block.name} arg={block.arg} onNavigate={onNavigate} />
        ),
      )}
    </>
  );
}
