import { ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { profile } from "./data/profile.ts";
import { elsewhere } from "./data/elsewhere.ts";
import { surfaces, type SurfaceGroup } from "./data/surfaces.ts";
import { BOOKS_BEFORE_BROS, LOOPDOWN_REPO } from "./data/writingMeta.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { useLiveSignal } from "./lib/useLiveSignal.ts";
import { SPOTIFY_PREVIEW } from "./lib/spotifyPreview.ts";
import type { SpotifyNow } from "../api/_lib/spotify-handler.ts";
import type { GithubActivity } from "../api/_lib/github-activity-handler.ts";

type FooterLink =
  | { label: string; kind: "route"; to: string; params?: { slug: string } }
  | { label: string; kind: "section"; id: string }
  | { label: string; kind: "external"; href: string };

/**
 * Sitemap footer — every surface of the site (and its satellites) reachable
 * from one place, so no page is a dead end. External links open new tabs.
 */
/**
 * Route links, straight off the registry.
 *
 * These two columns used to be hand-written, and had fallen to 8 of the
 * registry's 17 surfaces — /lab, /chess, /weeb, /pulse, /shipped, /ink,
 * /excelsior, /anthology and /forge were all unreachable from the footer
 * while its own docstring claimed "every surface of the site... so no page is
 * a dead end". That is this repo's signature defect: a hand-kept list that
 * mirrors src/data/surfaces.ts and quietly falls behind it, which no unit
 * test catches because a hand-kept list always agrees with itself.
 *
 * Same treatment the Elsewhere column already gets from elsewhere.ts. Add a
 * surface to the registry and it appears here; there is nothing left to
 * forget. SiteFooter.test.ts fails if any registry route is ever unlinked.
 */
/** Surfaces the Explore column promotes by hand, with a recruiter-facing
 *  label the registry has no business carrying ("Hire me (90 seconds)"). They
 *  are skipped below so they appear once, not twice. Promotion is editorial;
 *  OMISSION is the bug — so this list may only ever shrink the derived
 *  columns, never the set of reachable surfaces, and the test enforces that
 *  every entry here really is linked somewhere. */
const PROMOTED: readonly string[] = ["/hire", "/resume", "/playground"];

function fromRegistry(...groups: SurfaceGroup[]): FooterLink[] {
  return surfaces
    .filter((s) => groups.includes(s.group) && !PROMOTED.includes(s.to))
    .map((s) => ({ label: s.label, kind: "route" as const, to: s.to }));
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Hire me (90 seconds)", kind: "route", to: "/hire" },
      { label: "Fit check (paste a JD)", kind: "section", id: "fit" },
      { label: "Case studies", kind: "section", id: "work" },
      { label: "Projects", kind: "section", id: "projects" },
      { label: "The Source (repos)", kind: "section", id: "source" },
      { label: "Experience", kind: "section", id: "experience" },
      { label: "Skills", kind: "section", id: "skills" },
      { label: "Writing", kind: "section", id: "writing" },
      { label: "The Playground", kind: "route", to: "/playground" },
      { label: "Résumé", kind: "route", to: "/resume" },
    ],
  },
  {
    title: "Builds",
    links: [
      { label: "Mileway", kind: "route", to: "/project/$slug", params: { slug: "mileway" } },
      { label: "Kursi", kind: "route", to: "/project/$slug", params: { slug: "kursi" } },
      { label: "PaymentsLab", kind: "route", to: "/project/$slug", params: { slug: "paymentslab" } },
      { label: "HireSignal", kind: "route", to: "/project/$slug", params: { slug: "hiresignal" } },
      { label: "DEADLOCK", kind: "route", to: "/project/$slug", params: { slug: "deadlock" } },
    ],
  },
  {
    title: "Rooms",
    links: fromRegistry("runs", "proof"),
  },
  {
    title: "Writing",
    links: [
      ...fromRegistry("writing", "corpus"),
      { label: BOOKS_BEFORE_BROS.name, kind: "external", href: BOOKS_BEFORE_BROS.url },
      { label: "the-loopdown repo", kind: "external", href: LOOPDOWN_REPO },
      { label: "dev.to", kind: "external", href: "https://dev.to/darkpandawarrior" },
    ],
  },
  {
    title: "Elsewhere",
    // Derived from src/data/elsewhere.ts so the footer, the /elsewhere index and
    // anything else that lists his presences can never drift apart. A web sweep
    // found four profiles the site had never linked — Stack Overflow, X, the
    // Dice org chart, and the Editorial Board's own site.
    links: [
      ...elsewhere.map((e) => ({ label: e.label, kind: "external" as const, href: e.url })),
      { label: "Email", kind: "external", href: `mailto:${profile.email}` },
    ],
  },
];

const LINK_CLASS = "group inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-accent";

function NowChip() {
  const { data: spotify } = useLiveSignal<SpotifyNow>("/api/spotify");
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");

  const spotifyConnected = spotify?.connected === true;
  // spotify !== null means the endpoint answered; connected:false at that
  // point means "genuinely not set up" (not "still loading") — that's when
  // the skeleton preview shows, so the widget's shape is visible even before
  // the owner finishes the one-time Spotify OAuth setup.
  const spotifyPreview = spotify !== null && !spotifyConnected;

  const nowTrack = spotifyConnected
    ? spotify.isPlaying
      ? spotify.track
      : spotify.recent[0]?.track
    : spotifyPreview
      ? SPOTIFY_PREVIEW.track
      : undefined;
  const nowArtist = spotifyConnected
    ? spotify.isPlaying
      ? spotify.artist
      : spotify.recent[0]?.artist
    : spotifyPreview
      ? SPOTIFY_PREVIEW.artist
      : undefined;
  const nowArt = spotifyConnected ? (spotify.isPlaying ? spotify.albumArt : spotify.recent[0]?.albumArt) : undefined;
  const nowUrl = spotifyConnected ? (spotify.isPlaying ? spotify.url : spotify.recent[0]?.url) : undefined;
  const latestActivity = activity?.connected ? activity.items[0] : undefined;

  if (!nowTrack && !latestActivity) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 border-t border-line py-3 text-xs text-muted">
      {nowTrack && spotifyConnected && (
        <a href={nowUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-accent">
          {nowArt && <img src={nowArt} alt="" width={16} height={16} className="rounded-sm" />}
          <span>{spotify.isPlaying ? "Now playing" : "Last played"}: {nowTrack} · {nowArtist}</span>
        </a>
      )}
      {nowTrack && !spotifyConnected && (
        <span className="inline-flex items-center gap-2 opacity-50" title="Preview — connect Spotify to show real listening data">
          <span className="h-4 w-4 rounded-sm border border-dashed border-current" />
          <span className="border-b border-dashed border-current">
            {nowTrack} · {nowArtist} <em className="not-italic">(preview)</em>
          </span>
        </span>
      )}
      {latestActivity && (
        <a href={latestActivity.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
          {latestActivity.type === "push" ? "Pushed to" : latestActivity.type === "pr" ? "Opened a PR on" : "Created a ref on"} {latestActivity.repo.split("/")[1]}
        </a>
      )}
    </div>
  );
}

export function SiteFooter() {
  const { goToSection } = useSectionNav();

  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="kicker-accent font-semibold">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.kind === "route" && (
                    <Link to={l.to} params={l.params} className={LINK_CLASS}>
                      {l.label}
                    </Link>
                  )}
                  {l.kind === "section" && (
                    <button type="button" onClick={() => goToSection(l.id)} className={LINK_CLASS}>
                      {l.label}
                    </button>
                  )}
                  {l.kind === "external" && (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                      {l.label}
                      <ArrowUpRight size={11} className="opacity-0 transition group-hover:opacity-100" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <NowChip />
      <div className="border-t border-line py-5 text-center text-xs text-muted">
        Built with React 19, Tailwind v4, three.js, tldraw and an LLM-agnostic chat backend · {new Date().getFullYear()}
      </div>
    </footer>
  );
}
