import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { SiteFooter } from "../SiteFooter.tsx";

// Catch-all splat route (file name "$" is TanStack Router's file-based
// convention for a route matching any otherwise-unmatched path). It must
// `throw notFound()` from beforeLoad rather than just rendering a plain
// `component` - a route that resolves normally is a 200, and this repo's
// `vite preview` server falls through to the SSR router for ANY unresolved
// static asset (verified: /favicon.ico and /_vercel/speed-insights/script.js
// both hit this route locally, since neither exists on disk and there's no
// Vercel edge in front of `vite preview` to intercept them first). A plain
// 200 HTML response breaks the SpeedInsights <script> tag ("Unexpected
// token '<'" - the browser tries to execute the HTML body as JS). Throwing
// notFound() keeps the framework's real 404 status code (confirmed against
// the router's own pre-existing unmatched-route behavior) while still
// rendering our on-brand notFoundComponent instead of the generic default.
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw notFound();
  },
  head: () => ({
    meta: [
      { title: "404 · You're off the map | Siddharth Pandalai" },
      { name: "description", content: "This route doesn't exist. The atlas at /map is the way back in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: NotFoundPage,
});

const OUTBOUND_CLASS =
  "flex items-center gap-2 rounded-full border border-line px-6 py-3 font-semibold text-zinc-100 transition hover:border-accent hover:text-accent";

/**
 * Torn-map glyph - CSS/SVG only, no asset fetch. A rectangle with a jagged
 * bite out of its bottom-right corner (two ragged polylines standing in for
 * a tear), a dashed route running off the torn edge, and a pin with no dot
 * at the end of it: the "you are here" marker a real map would draw, except
 * there is nothing here to mark. Decorative - the words carry the meaning.
 */
function TornMapGlyph() {
  return (
    <svg width="168" height="132" viewBox="0 0 168 132" fill="none" aria-hidden="true" className="text-accent">
      <path
        d="M8 8 H160 V96 L142 84 L126 100 L108 82 L92 98 L74 80 L58 96 L40 78 L22 92 L8 76 Z"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 8 V76 M160 8 V96" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="2 4" />
      <path
        d="M24 24 C 50 20, 62 44, 88 40 S 128 30, 148 44"
        stroke="var(--color-probe)"
        strokeOpacity="0.6"
        strokeWidth="1.5"
        strokeDasharray="1 5"
        strokeLinecap="round"
      />
      <circle cx="148" cy="44" r="3" fill="var(--color-probe)" fillOpacity="0.7" />
      <path
        d="M118 66 C 118 58, 132 58, 132 66 C 132 72, 125 82, 125 82 C 125 82, 118 72, 118 66 Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * A real page, not a modal bolted onto the void. Wears the same nav/footer
 * furniture as every other route (see hire.tsx / ink.tsx for the pattern) and
 * the site's own type scale - no separate "error page" visual language.
 * `ErrorPanel` stays reserved for the root error boundary (__root.tsx), whose
 * job is to survive an actual render crash and so deliberately doesn't reach
 * for this much chrome.
 */
function NotFoundPage() {
  const { _splat } = Route.useParams();
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="font-display text-lg font-bold tracking-tight">
            sid<span className="text-accent">.</span><span className="text-zinc-400">android</span>
          </Link>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-6 section-y">
        <p className="kicker-accent">404 // no carrier</p>
        <div className="mt-3 flex flex-wrap items-start gap-6">
          <TornMapGlyph />
          <div className="min-w-0">
            <h1 className="font-display text-hero font-bold tracking-tight text-balance">You're off the map.</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300">
              {_splat ? `/${_splat}` : "That address"} doesn't resolve to anything on this site. The atlas
              (every project, every room, one measured graph) is the way back in.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/map"
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-ink transition hover:bg-accent-dim"
          >
            Explore the map
          </Link>
          <Link to="/" className={OUTBOUND_CLASS}>
            Home
          </Link>
          <Link to="/project/$slug" params={{ slug: "doori" }} className={OUTBOUND_CLASS}>
            The work
          </Link>
          <Link to="/ink" className={OUTBOUND_CLASS}>
            The writing
          </Link>
          <Link to="/resume" className={OUTBOUND_CLASS}>
            Résumé
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
