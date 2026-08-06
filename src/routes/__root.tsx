import { createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { scrollToSectionWhenReady, SECTION_IDS } from "../lib/navigation.ts";
import { ErrorPanel } from "../ErrorPanel.tsx";
import AnomalyRail from "../AnomalyRail.tsx";
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

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Siddharth Pandalai",
  url: "https://cv-siddharth.vercel.app/",
  jobTitle: "Senior Android Engineer",
  worksFor: { "@type": "Organization", name: "Dice.tech" },
  email: "mailto:siddharthpandalai990@gmail.com",
  alumniOf: "NIT Bhopal",
  address: { "@type": "PostalAddress", addressLocality: "Pune", addressCountry: "IN" },
  knowsAbout: ["Android", "Kotlin", "Kotlin Multiplatform", "Jetpack Compose", "Location Engineering", "Dead Reckoning", "Kalman Filtering", "Mobile Security", "Structured Concurrency"],
  sameAs: [
    "https://github.com/darkpandawarrior",
    "https://linkedin.com/in/siddharth-pandalai-3712b215a",
    "https://dev.to/darkpandawarrior",
    "https://medium.com/@siddharthpandalai990",
    "https://darkpandawarrior.hashnode.dev",
    "https://booksbeforebros.wordpress.com",
  ],
};

const PROFILEPAGE_LD = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  name: "Siddharth Pandalai | Senior Android Engineer",
  url: "https://cv-siddharth.vercel.app/",
  mainEntity: { "@type": "Person", name: "Siddharth Pandalai" },
  isPartOf: {
    "@type": "WebSite",
    name: "sid.android",
    url: "https://cv-siddharth.vercel.app/",
  },
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Siddharth Pandalai | Senior Android Engineer" },
      { name: "description", content: "Senior Android Engineer. Platform owner at 50k MAU scale. GPS accuracy 50%→95%, 80% crash reduction, ~87% of UI-layer code in Compose. Ask my AI assistant anything." },
      { name: "author", content: "Siddharth Pandalai" },
      { name: "theme-color", content: "#0b0f0d" },
      { name: "color-scheme", content: "dark" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://cv-siddharth.vercel.app/" },
      { property: "og:site_name", content: "sid.android" },
      { property: "og:title", content: "Siddharth Pandalai | Senior Android Engineer" },
      { property: "og:description", content: "Interactive CV with an AI assistant. GPS accuracy 50%→95%, 80% crash reduction, ~87% of UI-layer code in Compose at ~964k LOC." },
      { property: "og:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Siddharth Pandalai | Senior Android Engineer" },
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
      { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "Agent-readable profile" },
      { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230b0f0d'/%3E%3Ctext x='50' y='68' font-size='52' font-family='sans-serif' font-weight='bold' fill='%233ddc84' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E" },
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
        { label: "Mileway", to: "/project/$slug", params: { slug: "mileway" } },
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
const HASH_ROUTES = new Set(["resume", "loopdown", "terminal", "blueprint", "compose", "playground", "lab", "map", "forge"]);

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
        <AnomalyRail />
        <SpeedInsights />
        <Scripts />
        <noscript>
          <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", fontFamily: "system-ui", color: "#e8efe9" }}>
            <h1>Siddharth Pandalai — Senior Android Engineer</h1>
            <p>Platform owner of a ~964k-LOC, ~87%-Compose financial SaaS app serving 50,000+ monthly users. GPS accuracy 50%→95%, 80% crash reduction. Kotlin · Jetpack Compose · Kotlin Multiplatform.</p>
            <p>This portfolio is interactive and needs JavaScript. Text versions:</p>
            <ul>
              <li><a href="/llms.txt" style={{ color: "#3ddc84" }}>Profile summary (llms.txt)</a></li>
              <li><a href="/llms-full.txt" style={{ color: "#3ddc84" }}>Full profile (llms-full.txt)</a></li>
              <li><a href="https://github.com/darkpandawarrior" style={{ color: "#3ddc84" }}>GitHub</a></li>
              <li><a href="https://linkedin.com/in/siddharth-pandalai-3712b215a" style={{ color: "#3ddc84" }}>LinkedIn</a></li>
              <li><a href="mailto:siddharthpandalai990@gmail.com" style={{ color: "#3ddc84" }}>siddharthpandalai990@gmail.com</a></li>
            </ul>
          </main>
        </noscript>
      </body>
    </html>
  );
}
