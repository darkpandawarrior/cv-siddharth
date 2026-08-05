import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { SiteFooter } from "../SiteFooter.tsx";

// Catch-all splat route (file name "$" is TanStack Router's file-based
// convention for a route matching any otherwise-unmatched path). It must
// `throw notFound()` from beforeLoad rather than just rendering a plain
// `component` — a route that resolves normally is a 200, and this repo's
// `vite preview` server falls through to the SSR router for ANY unresolved
// static asset (verified: /favicon.ico and /_vercel/speed-insights/script.js
// both hit this route locally, since neither exists on disk and there's no
// Vercel edge in front of `vite preview` to intercept them first). A plain
// 200 HTML response breaks the SpeedInsights <script> tag ("Unexpected
// token '<'" — the browser tries to execute the HTML body as JS). Throwing
// notFound() keeps the framework's real 404 status code (confirmed against
// the router's own pre-existing unmatched-route behavior) while still
// rendering our on-brand notFoundComponent instead of the generic default.
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw notFound();
  },
  head: () => ({
    meta: [
      { title: "404 — Signal Lost | Siddharth Pandalai" },
      { name: "description", content: "This route doesn't exist. Head back to the signal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: NotFoundPage,
});

const OUTBOUND_CLASS =
  "flex items-center gap-2 rounded-full border border-line px-6 py-3 font-semibold text-zinc-100 transition hover:border-accent hover:text-accent";

/**
 * A real page, not a modal bolted onto the void. Wears the same nav/footer
 * furniture as every other route (see hire.tsx / ink.tsx for the pattern) and
 * the site's own type scale — no separate "error page" visual language.
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
        <p className="font-mono text-xs uppercase tracking-widest text-accent/80">404 // no carrier</p>
        <h1 className="font-display mt-3 text-hero font-bold tracking-tight text-balance">
          A broken link is not a dead end.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300">
          {_splat ? `/${_splat}` : "That address"} doesn't resolve to anything on this site. The work,
          the writing, and home haven't moved.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-ink transition hover:bg-accent-dim"
          >
            Home
          </Link>
          <Link to="/project/$slug" params={{ slug: "mileway" }} className={OUTBOUND_CLASS}>
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
