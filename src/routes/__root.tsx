import { createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { scrollToSectionWhenReady, SECTION_IDS } from "../lib/navigation.ts";
import { surfaces } from "../data/surfaces.ts";
import { profile, experience, education } from "../data/profile.ts";
import { ErrorPanel } from "../ErrorPanel.tsx";
import AnomalyRail from "../AnomalyRail.tsx";
import { Launcher } from "../Launcher.tsx";
import "../index.css";
// Self-hosted fonts (replaces the old Google Fonts CDN <link>).
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/rozha-one/400.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import spaceGrotesk700 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";

import { CommandPalette } from "../CommandPalette.tsx";
// Every role still running. Filtered over the whole array, never
// experience[0] — index 0 is whichever role was added most recently, and an
// index-based read silently demoted Dice.tech the day the consulting role
// landed above it.
const currentRoles = experience.filter((e) => e.period.trim().endsWith("Present"));

// The title, name and links a crawler reads, in one place. Nobody looking at
// the site would ever notice this block going stale, which is exactly why it
// derives from profile.ts instead of restating it — the linkedin URL here had
// already drifted from the one the résumé prints.
const PAGE_TITLE = `${profile.name} | ${profile.title}`;

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  url: `${profile.portfolio}/`,
  jobTitle: profile.title,
  // schema.org takes an array here, but a one-element array is noisier for a
  // scraper that just reads the first value, so a single current role stays a
  // bare object and only a genuine second one makes it a list.
  worksFor:
    currentRoles.length === 1
      ? { "@type": "Organization", name: currentRoles[0].company }
      : currentRoles.map((e) => ({ "@type": "Organization", name: e.company })),
  email: `mailto:${profile.email}`,
  alumniOf: { "@type": "CollegeOrUniversity", name: education.school },
  address: { "@type": "PostalAddress", addressLocality: "Pune", addressCountry: "IN" },
  // Hand-written, and staying that way: there is no list of these in
  // src/data/, and the writing platforms below are not in profile.ts either.
  knowsAbout: ["Android", "Kotlin", "Kotlin Multiplatform", "Jetpack Compose", "Location Engineering", "Dead Reckoning", "Kalman Filtering", "Mobile Security", "Structured Concurrency"],
  sameAs: [
    profile.github,
    profile.linkedin,
    "https://dev.to/darkpandawarrior",
    "https://medium.com/@siddharthpandalai990",
    "https://darkpandawarrior.hashnode.dev",
    "https://booksbeforebros.wordpress.com",
  ],
};

const PROFILEPAGE_LD = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  name: PAGE_TITLE,
  url: `${profile.portfolio}/`,
  mainEntity: { "@type": "Person", name: profile.name },
  isPartOf: {
    "@type": "WebSite",
    name: "sid.android",
    url: `${profile.portfolio}/`,
  },
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: PAGE_TITLE },
      // The title leads, then the numbers as prose. The figures stay written
      // out on purpose: this line is a ~155-character sentence under an SEO
      // budget, not a list of metrics joined with commas.
      { name: "description", content: `${profile.title}. Platform owner at 50k MAU scale. GPS accuracy 50%→95%, 80% crash reduction, ~87% of UI-layer code in Compose. Ask my AI assistant anything.` },
      { name: "author", content: profile.name },
      { name: "theme-color", content: "#0b0f0d" },
      { name: "color-scheme", content: "dark" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://cv-siddharth.vercel.app/" },
      { property: "og:site_name", content: "sid.android" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: "Interactive CV with an AI assistant. GPS accuracy 50%→95%, 80% crash reduction, ~87% of UI-layer code in Compose at ~964k LOC." },
      { property: "og:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: "Interactive CV with an AI assistant, 3D storyboard and an infinite blueprint canvas. Android · Kotlin · KMP." },
      { name: "twitter:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
    ],
    links: [
      // No hardcoded canonical here — see src/routes/index.tsx for why:
      // the router's `links` array concatenates instead of deduping by
      // `rel`, so a root-level canonical would double up with every
      // per-route override (resume.tsx, project.$slug.tsx) instead of
      // being replaced by it.
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "alternate", type: "application/atom+xml", href: "/feed.xml", title: "The Loopdown — field notes" },
      // Two feeds, because they are two different things a reader can want and
      // a single merged one would put a Kotlin coroutine post next to a page
      // being withdrawn from a burning case. The anthology's own summaries go
      // through describes(), so a piece whose blurb came off the prose ships
      // with no summary rather than a finished sentence.
      { rel: "alternate", type: "application/atom+xml", href: "/anthology.xml", title: "The Morkinstar Journals" },
      { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "Agent-readable profile" },
      { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E %3Crect x='0' y='0' width='48' height='48' fill='%230A0D0C'/%3E %3Cg fill='none' stroke='%23F2A13D' stroke-linecap='round' stroke-linejoin='round'%3E %3Crect x='4' y='4' width='40' height='40' rx='10' stroke-width='2'/%3E %3Crect x='22' y='18' width='12' height='12' rx='4' stroke-width='2'/%3E %3Crect x='18' y='18' width='12' height='12' rx='4' stroke-width='4'/%3E %3Cline x1='24' y1='8' x2='24' y2='12' stroke-width='2'/%3E %3Cline x1='24' y1='36' x2='24' y2='40' stroke-width='2'/%3E %3Cline x1='8' y1='24' x2='12' y2='24' stroke-width='2'/%3E %3Cline x1='36' y1='24' x2='40' y2='24' stroke-width='2'/%3E %3C/g%3E %3Ccircle cx='12' cy='12' r='3' fill='%23F2A13D'/%3E %3C/svg%3E" },
      { rel: "preload", as: "font", type: "font/woff2", href: spaceGrotesk700, crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: inter400, crossOrigin: "anonymous" },
    ],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(PERSON_LD) },
      { type: "application/ld+json", children: JSON.stringify(PROFILEPAGE_LD) },
    ],
  }),
  // shellComponent (not component): it wraps everything, INCLUDING the
  // CatchBoundary that errorComponent renders inside. A plain `component`
  // here would put the <html>/<head>/<body> shell itself inside that
  // boundary, so a render error anywhere in the tree would replace the
  // whole document (losing HeadContent/Scripts/fonts) instead of just the
  // routed content — verified against @tanstack/react-router's Match.js
  // (shellComponent is the only root option rendered outside the boundary).
  shellComponent: RootDocument,
  errorComponent: RootErrorComponent,
  // Root-level notFound handler so ANY `throw notFound()` (e.g. an unknown
  // project slug in project.$slug's beforeLoad) renders the on-brand 404 —
  // not just the `$` splat route's own. The framework still returns a real
  // 404 status; this only replaces the generic default body.
  notFoundComponent: RootNotFoundComponent,
});

function RootNotFoundComponent() {
  return (
    <ErrorPanel
      code="404 // NO CARRIER"
      title="Signal lost"
      message="That route doesn't exist."
      extraLinks={[
        { label: "Doori", to: "/project/$slug", params: { slug: "doori" } },
        { label: "Résumé", to: "/resume" },
      ]}
    />
  );
}

function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <ErrorPanel
      code="ERR // TELEMETRY LOST"
      title="Something broke"
      message={error instanceof Error && error.message ? error.message : "An unexpected error interrupted this page."}
      onReload={() => window.location.reload()}
      extraLinks={[{ label: "Résumé", to: "/resume" }]}
    />
  );
}

// Real route paths this site owns. Any legacy `#hash` matching one of these
// (or `?project=<slug>`) is redirected to the real path; on-page section
// anchors (#work, #projects, #skills, #writing, #contact, #experience) are
// left alone so home-page scroll links keep working.
//
// Derived, because the hand-kept version drifted the way every hand-kept copy
// of the route list on this site has: it listed nine of the sixteen routes, so
// `#chess`, `#weeb`, `#hire`, `#pulse`, `#ink`, `#excelsior` and `#shipped`
// were all legacy links that silently did nothing. The registry already knows
// every route — surfaces.test.ts fails the build if it does not.
//
// Minus the section ids, and that subtraction is the whole subtlety: `shipped`
// is both a route and a home-page section, and if the route wins then the
// homepage's own "#shipped" scroll link navigates off the homepage. A section
// id shadows a same-named route here for the same reason it does in
// classifyHash.
const HASH_ROUTES = new Set(
  surfaces.map((s) => s.to.replace(/^\//, "")).filter((slug) => !SECTION_IDS.has(slug)),
);

// Home-page-only scroll targets (ids live in src/App.tsx). Isolated routes
// (/lab, /terminal, /project/*, ...) reuse these same "#top" / "#contact"
// hrefs as their only "back to portfolio" control, but they don't own the
// section — left alone, the hash just changes the URL to e.g. `/lab#top`
// with nothing on the page to scroll to. Route home instead.
// Every home-page section id comes straight from navigation.ts. This used to be
// a hand-retyped copy, and it drifted exactly as you'd expect: its own comment
// recorded `source`/`writing` being stranded once, and it was silently missing
// `chess` again. Footer + command palette link to all of these from non-home
// routes, so every one must route home — deriving is the only way that stays
// true when a section is added.
const SECTION_ANCHORS = SECTION_IDS;

/**
 * Backtick summons the terminal — from anywhere, which is what the copy on the
 * Playground and in the terminal's own hint has always claimed.
 *
 * It used to be a useEffect inside HomePage(), so it worked on `/` and nowhere
 * else: 15 of the 17 routes silently didn't have it. Mounted here it is true on
 * every route, and it costs one keydown listener.
 *
 * Ignores typing contexts (including the terminal's own input, so ` types
 * normally there) and any modified press, so ⌥` and friends still reach the OS.
 */
function TerminalHotkey() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "`" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // Already there — let the key through rather than re-navigating.
      if (router.state.location.pathname === "/terminal") return;
      e.preventDefault();
      router.navigate({ to: "/terminal" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}

function HashCompat() {
  const router = useRouter();
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash.startsWith("project/")) {
        router.navigate({ to: "/project/$slug", params: { slug: hash.slice("project/".length) }, replace: true });
        return;
      }
      if (HASH_ROUTES.has(hash)) {
        router.navigate({ to: `/${hash}`, replace: true });
        return;
      }
      if (SECTION_ANCHORS.has(hash) && window.location.pathname !== "/") {
        // TanStack's built-in hashScrollIntoView (from scrollRestoration in
        // src/router.tsx) fires on its own "onRendered" event, but a plain
        // `<a href="#top">` never preloads the home route — its chunk is
        // still loading when that event fires, so the id isn't in the DOM
        // yet and the built-in scroll silently no-ops. Verified in-browser:
        // without this, landing from /project/<slug> via "#projects" stops
        // at the top of "/" instead of scrolling down. Retry once the
        // navigation (incl. lazy chunk) has actually settled.
        router.navigate({ to: "/", hash, replace: true }).then(() => scrollToSectionWhenReady(hash));
        return;
      }
      // LinkedIn Featured strips the #fragment but keeps ?project=<slug>.
      const project = new URLSearchParams(window.location.search).get("project");
      if (project) router.navigate({ to: "/project/$slug", params: { slug: project }, replace: true });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [router]);
  return null;
}

// Registers the installable PWA's service worker — PROD-only, and only after
// the page has loaded, so it never intercepts the first SSR paint or fights
// Vite's dev HMR. The SW itself (public/sw.js) is network-first for
// navigations, so registering it can't serve stale SSR.
function RegisterServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort — the app works fine without it */
    });
  }, []);
  return null;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* First focusable element on every route: hidden until Tab reveals it,
            jumps keyboard/screen-reader users past the nav straight to the
            route's <main id="main-content">. Tailwind's built-in sr-only /
            focus:not-sr-only utilities do the hide/reveal — no bespoke CSS. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>
        <HashCompat />
        <RegisterServiceWorker />
        <TerminalHotkey />
        {children}
        {/* Mounted after the routed content (never blocks first paint) and
            outside <main id="main-content">, so the skip link still jumps
            straight past it to the page's own content. */}
        {/* The launcher overlay. Global like AnomalyRail and for the same
            reason: it belongs to the shell, not to any one route. Mounted
            after the routed content and outside <main id="main-content">, so
            the skip link still jumps past it, and it renders nothing at all
            until something calls openLauncher(). */}
        <Launcher />
        <AnomalyRail />
        {/* Global, like the two above. It was mounted in three places instead
            — App.tsx, rooms.tsx and Playground.tsx — so every route that is
            not the homepage and does not use RoomFrame had no palette at all:
            /shipped, /pulse, /ink, /excelsior, /anthology, /loopdown,
            /read/$slug, /hire, /resume and /project/$slug. Its own docstring
            called itself "Global ⌘K". One mount makes that true, and avoids
            the duplicate ⌘K listeners three mounts would have caused. */}
        <CommandPalette />
        <SpeedInsights />
        <Scripts />
        <noscript>
          <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", fontFamily: "system-ui", color: "var(--color-text)" }}>
            {/* The one body a crawler with no JS ever reads, so it derives
                too — a stale title here is a stale title everywhere that
                matters. */}
            <h1>
              {profile.name} — {profile.title}
            </h1>
            <p>Platform owner of a ~964k-LOC, ~87%-Compose financial SaaS app serving 50,000+ monthly users. GPS accuracy 50%→95%, 80% crash reduction. Kotlin · Jetpack Compose · Kotlin Multiplatform.</p>
            <p>This portfolio is interactive and needs JavaScript. Text versions:</p>
            <ul>
              <li><a href="/llms.txt" style={{ color: "var(--color-signal)" }}>Profile summary (llms.txt)</a></li>
              <li><a href="/llms-full.txt" style={{ color: "var(--color-signal)" }}>Full profile (llms-full.txt)</a></li>
              <li><a href={profile.github} style={{ color: "var(--color-signal)" }}>GitHub</a></li>
              <li><a href={profile.linkedin} style={{ color: "var(--color-signal)" }}>LinkedIn</a></li>
              <li><a href={`mailto:${profile.email}`} style={{ color: "var(--color-signal)" }}>{profile.email}</a></li>
            </ul>
          </main>
        </noscript>
      </body>
    </html>
  );
}
