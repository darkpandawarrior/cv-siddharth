/**
 * Ambient route awareness for the console.
 *
 * The chat panel is mounted on every route, so it can know WHERE the visitor
 * is standing. Three things come out of that, all derived from the same table
 * below so none of them can drift from the router or from profile.ts:
 *
 *  1. the suggestion chips (project questions on /project/<slug>, room
 *     questions in a room, résumé questions on /resume),
 *  2. the greeting the panel opens with,
 *  3. the route string sent to the server, which appends it to the system
 *     prompt as trusted context (api/_lib/chat-handler.ts re-validates it
 *     against ROUTE_PHRASES — this file is client code, so its output is
 *     untrusted by the time it lands there).
 *
 * Pure and DOM-free: `scripts/gen-system-prompt.mjs` imports ROUTE_PHRASES to
 * emit the server's allowlist, and the unit tests import the rest.
 */
import { projects } from "../data/profile.ts";
import { surfaces } from "../data/surfaces.ts";

export type RouteKind = "home" | "project" | "room" | "page";

export interface RouteInfo {
  /** The canonical pathname — the only shape the server will accept. */
  route: string;
  /** Short display name, used in chips and the greeting ("Doori"). */
  label: string;
  /** Sentence-ready phrase for the server prompt ("the Doori case study"). */
  phrase: string;
  kind: RouteKind;
}

/**
 * A project's `name` is a title, not a noun phrase — the portfolio entry is
 * literally `This portfolio + “Panda”, my AI assistant`, which reads badly inside
 * "How did you build …?". Take the part before the " + " when there is one;
 * everything else is unchanged, so this degrades to a no-op rather than to
 * wrong copy if a name is ever rewritten.
 */
function shortName(name: string): string {
  return name.split(" + ")[0].trim();
}

/**
 * Every route the console can be standing on.
 *
 * Derived from src/data/surfaces.ts, which already carries the `kind` split
 * this file needs — eight rooms and nine pages. It used to derive its rooms
 * from profile.ts's `siteRooms` and then hand-list three pages beside them,
 * and siteRooms is one of the THREE older registries surfaces.ts was written
 * to replace. It has eight entries against the registry's seventeen, so the
 * assistant was blind to six surfaces while a visitor was standing on them:
 * /hire, /shipped, /pulse, /ink, /excelsior and /anthology. /hire is the
 * recruiter page. Ask Panda "what is this page" there and it did not know.
 *
 * Membership derives. PHRASING may be tuned, because a registry label is
 * written for a tile and these go inside a sentence — "his résumé" reads
 * where "Résumé" does not. Overrides are presentation only and can never add
 * or remove a route, which is the distinction that lets this stay honest.
 */
const PHRASE_OVERRIDES: Record<string, { label?: string; phrase: string }> = {
  "/resume": { label: "his résumé", phrase: "his résumé" },
  "/playground": { phrase: "The Playground (the index of every room)" },
  "/loopdown": { phrase: "The Loopdown (his writing)" },
};

const ROUTES: RouteInfo[] = [
  { route: "/", label: "the home page", phrase: "the home page", kind: "home" },
  ...surfaces.map((s): RouteInfo => {
    const o = PHRASE_OVERRIDES[s.to];
    return {
      route: s.to,
      label: o?.label ?? s.label,
      phrase: o?.phrase ?? s.label,
      kind: s.kind === "room" ? "room" : "page",
    };
  }),
  ...projects.map((p): RouteInfo => {
    const label = shortName(p.name);
    // Possessive rather than "the <name> case study": one of these names is
    // "This portfolio", and "the This portfolio case study" is not English.
    return { route: `/project/${p.slug}`, label, phrase: `${label}'s case study`, kind: "project" };
  }),
];

const BY_ROUTE = new Map(ROUTES.map((r) => [r.route, r]));

/** route → the phrase the server drops into the system prompt. */
export const ROUTE_PHRASES: Record<string, string> = Object.fromEntries(ROUTES.map((r) => [r.route, r.phrase]));

/** A pathname → the route it is, or undefined for anything unknown (404s, /$). */
export function routeInfo(pathname: string): RouteInfo | undefined {
  // Trailing slashes are the one variation the router will hand us for the
  // same page ("/lab/" and "/lab"); everything else must miss.
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return BY_ROUTE.get(clean);
}

/**
 * What the client tells the server. Deliberately the CANONICAL route rather
 * than `location.pathname` — an unknown or hostile path never leaves the
 * browser, and the server's own check (validateRoute) is the one that counts.
 */
export function canonicalRoute(pathname: string): string | undefined {
  return routeInfo(pathname)?.route;
}

// The one chip that doesn't ask a question: it opens the JD composer instead.
// Recruiters are the audience this site is for, so it goes first on every
// route and never gets filtered out by the "already asked" rule — its text
// never lands in the transcript.
export const JD_PROMPT = "Paste a job description — I'll assess his fit";

/** The home / unknown-route set: the site as a whole. */
export const QUICK_PROMPTS = [
  JD_PROMPT,
  "What can I do on this site?",
  "Show me the interactive demos",
  "How did you get GPS accuracy to 95%?",
  "Which project should I look at first?",
  "Tell me about the Compose migration",
];

export const HOME_GREETING =
  "Hi, I'm **Panda** — Siddharth's AI assistant. Ask me about his Android work (GPS engineering, the Compose migration, crash hunts), or ask me to show you around — I can link you straight to the demos, case studies and writing on this site.\n\nHiring? Type `/jd`, paste the job description, and I'll score the fit honestly — gaps included. Type `/` for the rest of the commands.";

// Only /resume gets its own copy — its questions are about a person, not about
// a thing on a page, so no template produces them. Every other page falls back
// to the generic shape below.
const PAGE_CHIPS: Record<string, string[]> = {
  "/resume": ["Walk me through your experience", "What are you strongest at?", "Are you open to new roles?"],
};

function contextChips(info: RouteInfo): string[] {
  // Templated off `label` on purpose: per-slug copy would drift the moment a
  // project is renamed or added.
  if (info.kind === "project")
    return [
      `How did you build ${info.label}?`,
      `What was the hardest part of ${info.label}?`,
      `What's the stack behind ${info.label}?`,
    ];
  if (info.kind === "room")
    return [`What is ${info.label}?`, `How did you build ${info.label}?`, "What else can I do on this site?"];
  return (
    PAGE_CHIPS[info.route] ?? [
      `What is ${info.label}?`,
      "What else can I do on this site?",
      "Which project should I look at first?",
    ]
  );
}

/** The suggestion chips for a pathname. Home and unknown routes get the general set. */
export function chipsFor(pathname: string): string[] {
  const info = routeInfo(pathname);
  if (!info || info.kind === "home") return QUICK_PROMPTS;
  return [JD_PROMPT, ...contextChips(info)];
}

/**
 * The panel's first message. Off the home route it acknowledges where the
 * visitor is — ambient, one line, and it never becomes a second message in the
 * transcript (see FloatingChat: the greeting is rendered, never sent).
 */
export function greetingFor(pathname: string): string {
  const info = routeInfo(pathname);
  if (!info || info.kind === "home") return HOME_GREETING;
  return `You're looking at **${info.label}** — ask me anything about it, or ask me to show you somewhere else on the site.\n\nHiring? Type \`/jd\` and paste a job description for an honest fit read. Type \`/\` for the rest of the commands.`;
}
