import { ArrowUpRight } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
// core.ts + projectCards.ts directly, not the ../data/profile.ts barrel's
// `projects`: the "Builds" column only ever needed hasDetail/name/slug, which
// projectCards.ts already carries — importing the full `projects` array
// pulled profile-projects-heavy chunk's whole reachability set (including
// data/surfaces.ts, data/labs.ts and friends, which rolldown was bundling
// alongside it) into every route that renders this footer, and from there
// into the app's one shared entry (e2e/spine-payload.spec.ts caught the
// resulting leak on /chess, /terminal, /weeb and /hire — none of which even
// render this footer).
import { profile } from "./data/profile/core.ts";
import { projectCards } from "./data/profile/projectCards.ts";
import { FaqDock } from "./FaqDock.tsx";
import { elsewhere } from "./data/elsewhere.ts";
import { surfaces, type SurfaceGroup } from "./data/surfaces.ts";
import { BOOKS_BEFORE_BROS, LOOPDOWN_REPO } from "./data/writingMeta.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { useLiveSignal } from "./lib/useLiveSignal.ts";
import { useWeather } from "./lib/useSky.ts";
import { WMO_LABEL } from "./lib/sky.ts";
import { isPlausibleTempC, isPlausibleCloudPct, isPlausibleTimestamp } from "./lib/plausibility.ts";
import { SPOTIFY_PREVIEW } from "./lib/spotifyPreview.ts";
import { EvidenceChip } from "./EvidenceChip.tsx";
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
    /* Same treatment as the registry columns, one file over: a `detail` block
       is exactly what makes /project/$slug renderable, so it is the honest
       filter. The hand-kept version listed five of the eight and had never
       been told about cv-siddharth, the KMP toolkit family or The Loopdown.
       Short label per DeviceMorph's convention, because the portfolio entry's
       full name is a 60-character sentence. */
    title: "Builds",
    links: projectCards
      .filter((p) => p.hasDetail)
      .map((p) => ({
        label: p.name.split(" — ")[0],
        kind: "route" as const,
        to: "/project/$slug",
        params: { slug: p.slug },
      })),
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
    // Derived from src/data/elsewhere.ts so the footer and anything else that
    // lists his presences can never drift apart. (This used to also promise an
    // "/elsewhere index" route. There is no such route and there does not need
    // to be: this column, the palette's synonym coverage and /hire's outbound
    // links already surface every profile. A comment describing a page that
    // was never built is how a reader concludes the site is half-finished.) A web sweep
    // found four profiles the site had never linked — Stack Overflow, X, the
    // Dice org chart, and the Editorial Board's own site.
    links: [
      ...elsewhere.map((e) => ({ label: e.label, kind: "external" as const, href: e.url })),
      { label: "Email", kind: "external", href: `mailto:${profile.email}` },
    ],
  },
];

const LINK_CLASS = "group inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-accent";

/**
 * The real Pune weather, read once by useWeather() (the one shared
 * /api/weather poll — StudioRig, /pulse and the v1 ledger all read the same
 * store). Pending (no reading yet, including SSR and the client's first
 * paint) renders nothing, same discipline as EvidenceChip: nothing timed is
 * ever server-rendered. AQI is omitted when the air reading is null, rather
 * than shown as a false zero (spine F16/M57 amendment: SkyLine carries "one
 * real sky on every page"; this chip is the footer's own weather claim, on
 * footer routes only).
 */
function WeatherChip() {
  const { weather, air, state } = useWeather();
  if (state === "pending") return null;
  if (!weather) {
    return <span>Pune weather unavailable right now</span>;
  }
  const label = WMO_LABEL[weather.code] ?? "unknown";
  const aqi = air ? `, AQI ${Math.round(air.usAqi)}` : "";
  // Same plausibility gate the spec asks every live reading to clear
  // (idea-atlas SYS-3): a reading that arrived but looks wrong gets a shape
  // (hollow ring), not a silent pass-through.
  const suspect =
    !isPlausibleTempC(weather.tempC) || !isPlausibleCloudPct(weather.cloudPct) || !isPlausibleTimestamp(weather.at);
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href="https://open-meteo.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-accent"
        title="Weather data by Open-Meteo.com (CC BY 4.0)"
      >
        Pune {weather.tempC.toFixed(1)} °C, {label}
        {aqi}
      </a>
      <EvidenceChip
        file="weather"
        source="Open-Meteo (CC BY 4.0)"
        cadence="live"
        live={{ at: weather.at, ok: true }}
        suspect={suspect}
      />
    </span>
  );
}

function NowChip() {
  const weatherState = useWeather().state;
  const { data: spotify } = useLiveSignal<SpotifyNow>("/api/spotify");
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");

  const spotifyConnected = spotify?.connected === true;
  // spotify !== null means the endpoint answered; connected:false at that
  // point means "genuinely not set up" (not "still loading") — that's when
  // the skeleton preview shows, so the widget's shape is visible even before
  // the owner finishes the one-time Spotify OAuth setup. Production never
  // shows a placeholder as if it were real activity (spine F3): the preview
  // is a dev-only affordance so the widget's shape stays visible while
  // building, gated the same way the spec asks (`import.meta.env.DEV`).
  const spotifyPreview = import.meta.env.DEV && spotify !== null && !spotifyConnected;

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
  /**
   * The feed, not one line of it.
   *
   * This rendered `items[0]` — a single push — while the endpoint returned
   * twenty across a dozen repositories, four of them other people's. On a
   * site whose whole argument is "here is the work", surfacing one event and
   * discarding nineteen was the wrong end of the trade.
   *
   * Collapsed to one row per REPOSITORY, most recent first, because five
   * pushes to the same repo in a morning is one fact, not five. Upstream
   * contributions are marked: a commit to someone else's project is a
   * different claim from a commit to your own, and the shape now says which.
   */
  const recent = activity?.connected ? activity.items : [];
  const byRepo = new Map<string, (typeof recent)[number]>();
  for (const item of recent) if (!byRepo.has(item.repo)) byRepo.set(item.repo, item);
  const repos = [...byRepo.values()].slice(0, 5);
  const latestActivity = repos[0];

  if (!nowTrack && !latestActivity && weatherState === "pending") return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 border-t border-line py-3 text-xs text-muted">
      <WeatherChip />
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
      {repos.length > 0 && (
        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="kicker">recently</span>
          {repos.map((a) => (
            <a
              key={a.repo}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-accent"
              title={`${a.type === "pr" ? "Opened a PR on" : a.type === "create" ? "Created a ref on" : "Pushed to"} ${a.repo}`}
            >
              {a.repo.split("/")[1]}
              {a.upstream && <span className="kicker-accent" title="a contribution to someone else's project">↗</span>}
            </a>
          ))}
        </span>
      )}
    </div>
  );
}

export function SiteFooter() {
  const { goToSection } = useSectionNav();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <footer className="relative border-t border-line" data-spine="site-footer">
      {/* The FAQ docks as the footer's FIRST band (spine F1, F2, H7): every
          route with a footer gets it in the same place, by construction —
          no per-route "mount FloatingChat after my own content" ordering
          bug is possible once there is only one place this renders. JSON-LD
          on / only (F14). */}
      <FaqDock jsonLd={pathname === "/"} />
      {/* Below 640px a strict 2-col grid pairs columns by INDEX, not by
          height — Rooms+Writing (the two tallest, unrelated to each other)
          always land in the same row and set it to both their heights
          combined into the tallest. CSS multicol balances the same 5 blocks
          by actual height instead (native, no JS masonry), which is what
          gets mobile back under the spine budget (spine F4); break-inside-
          avoid keeps each column's heading glued to its own list. `sm:grid`
          overrides `columns-2` outright once there is room for a real grid. */}
      <div className="mx-auto max-w-5xl columns-2 gap-6 px-6 py-8 sm:grid sm:gap-8 sm:py-10 sm:grid-cols-4 lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <div key={col.title} className="break-inside-avoid">
            <h3 className="kicker-accent font-semibold">{col.title}</h3>
            {/* Elsewhere (13 links) started this: stacked one-per-line it
                wrapped into a second row and pushed the whole footer past
                budget (spine F4). Read left to right instead, same as a tag
                list — a set of destinations, not a sequence worth one line
                each. Below 640px every column reads the same way: the site
                has grown past what four full stacked lists plus Elsewhere
                can fit in the mobile budget even after the multicol balance
                above, so the same tightening applies everywhere, not just
                the column that first triggered it. sm: reverts to one
                line per link, which fits fine once four real columns share
                the width instead of two. */}
            <ul className={col.title === "Elsewhere" ? "mt-3 flex flex-wrap gap-x-3 gap-y-1.5" : "mt-3 flex flex-wrap gap-x-3 gap-y-1.5 sm:block sm:space-y-2"}>
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
