import { Link } from "@tanstack/react-router";
import { ArrowLeft, Star, Download, ExternalLink } from "lucide-react";
import { storeApps, fleet, delisted, fleetStats, storeGeneratedAt } from "./data/store.ts";
import { AppIcon, ShippedTile } from "./ShippedTile.tsx";
import { compact } from "./shippedFormat.ts";

/**
 * The shelf, in full.
 *
 * The homepage carries a summary of this; everything that would turn that
 * summary into a wall of numbers lives here instead — the whole fleet, the apps
 * that were pulled from the store, and the method, which is the part that makes
 * any of it worth believing.
 */
export function Shipped() {
  const reached = fleetStats.live + delisted.length;

  return (
    <div className="min-h-screen">
      <main id="main-content" tabIndex={-1} className="section-y mx-auto max-w-6xl px-6">
        <Link
          to="/"
          hash="shipped"
          className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent"
        >
          <ArrowLeft size={16} /> Back to portfolio
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent/70">
            // the shelf
          </p>
          <h1 className="font-display mt-1.5 text-h2 font-bold tracking-tight">
            Everything that shipped
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-400">
            Three of these carry my name. The other {reached - storeApps.length} carry someone
            else&rsquo;s — clients of a white-label platform I spent two and a half years inside,
            each one a separate build of the same two codebases, published under its own company on
            Google Play.
          </p>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-500">
            I never had a list of them. This page is the list, reconstructed from the repositories
            and checked one listing at a time — including {delisted.length} that are no longer on
            the store, and can only be shown at all because someone archived the page before it went
            away.
          </p>
        </header>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-line py-8 sm:grid-cols-4">
          {[
            [String(reached), "apps reached the store"],
            [String(fleetStats.live), "still on it today"],
            [String(fleetStats.developers), "companies published them"],
            [`≥ ${compact(fleetStats.installFloor)}`, "installs, on Play's own counts"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="font-display text-4xl font-bold tabular-nums text-accent">{value}</dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-muted">{label}</dd>
            </div>
          ))}
        </dl>

        {/* ── The three ─────────────────────────────────────────────────── */}
        <section className="mt-14">
          <h2 className="font-display text-xl font-bold tracking-tight">
            The three with my name on them
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {storeApps.map((app) => (
              <li key={app.id}>
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition hover:-translate-y-1 hover:border-accent"
                >
                  <AppIcon app={app} size={48} />
                  <span className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted">
                    {app.employer}
                  </span>
                  <span className="font-display mt-1 text-lg font-bold transition group-hover:text-accent">
                    {app.name}
                  </span>
                  <span className="mt-1 text-sm leading-relaxed text-zinc-400">{app.role}</span>
                  <span className="mt-4 flex items-center gap-4 font-mono text-[11px] text-muted">
                    {app.rating !== null && (
                      <span className="flex items-center gap-1.5">
                        <Star size={12} className="text-accent" aria-hidden />
                        {app.rating.toFixed(1)}
                        <span className="sr-only">stars</span>
                      </span>
                    )}
                    {app.installs && (
                      <span className="flex items-center gap-1.5">
                        <Download size={12} aria-hidden />
                        {app.installs}
                        <span className="sr-only">installs</span>
                      </span>
                    )}
                    <ExternalLink
                      size={12}
                      className="ml-auto opacity-0 transition group-hover:opacity-100"
                      aria-hidden
                    />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Live ──────────────────────────────────────────────────────── */}
        <section className="mt-14">
          <h2 className="font-display text-xl font-bold tracking-tight">
            On the store now &mdash; {fleetStats.live}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            Every one of these is a link you can open. The rating and install bucket were read from
            the listing, the company name is whoever Play says publishes it, and the coloured edge
            is the hex that client&rsquo;s build tinted its own theme to.
          </p>
          {/* grid-cols-1 is load-bearing on mobile: without a base column
              class the track is `auto`, which sizes to the widest tile's
              max-content and pushes the page 50px past a 390px viewport. */}
          <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fleet.map((app) => (
              <li key={app.id}>
                <ShippedTile app={app} />
              </li>
            ))}
          </ul>
        </section>

        {/* ── Pulled ────────────────────────────────────────────────────── */}
        <section className="mt-14">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Pulled since &mdash; {delisted.length}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            A package id that returns 404 today has two possible histories: it was never published,
            or it shipped and was later taken down. Play answers both the same way. The Internet
            Archive does not — it kept a copy of each of these listings, which is how they can be
            named at all. Each link opens the archived page.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            The icons are not from the Archive. They came out of the branch that built each app: a
            rebranded flavour has to ship its own launcher icon, and that icon is still sitting in
            the commit.
          </p>
          {/* grid-cols-1 is load-bearing on mobile: without a base column
              class the track is `auto`, which sizes to the widest tile's
              max-content and pushes the page 50px past a 390px viewport. */}
          <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {delisted.map((app) => (
              <li key={app.id}>
                <ShippedTile app={app} past />
              </li>
            ))}
          </ul>
        </section>

        {/* ── Method ────────────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-xl font-bold tracking-tight">How this was found</h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            None of it was typed from memory, which matters more here than anywhere else on this
            site: nobody can recall {reached} apps, and a portfolio that lists them from
            recollection is a portfolio you should not trust.
          </p>

          <ol className="mt-8 grid gap-6 sm:grid-cols-2">
            {[
              {
                h: "Every client is a branch",
                p: `That is simply how the platform worked, and it is why the list is recoverable at all. Walking the full history of those branches for every applicationId ever committed on one turns up ${fleetStats.clients.toLocaleString("en-IN")} distinct client packages — including the ones whose id changed later, which reading the branch tips alone would have missed.`,
              },
              {
                h: "Then ask Play about each",
                p: `Most never shipped: white-label pilots that ended as pilots. ${fleetStats.live} still resolve, and each one hands back its name, icon, rating, install bucket and publisher. Anything that stops resolving is dropped rather than left on the page as a dead link.`,
              },
              {
                h: "Then ask the Archive about the rest",
                p: `A crawled listing page proves the app was on sale even though the id is dead now, and ${delisted.length} of them have one. This is a floor and never a count — the Archive crawls what it happens to crawl, so an app with no snapshot is not an app that was never published.`,
              },
              {
                h: "What is deliberately not here",
                p: "Branch names, because they are internal and some carry colleagues' names. Anything the platform's own template ids point at, because a template is not a client. And one app with a million installs whose id appears only on a mainline branch, two years before I joined — it resolves, and it is still not mine.",
              },
            ].map((step, i) => (
              <li key={step.h} className="rounded-2xl border border-line bg-card/40 p-5">
                <span className="font-mono text-[11px] text-accent">0{i + 1}</span>
                <h3 className="font-display mt-1 text-base font-bold">{step.h}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.p}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
            <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-accent align-middle" />{" "}
            marks the {fleetStats.setUpByHim + delisted.filter((a) => a.setUpByHim).length} whose
            client package id I added myself. {fleetStats.carryingHisCommits} of the{" "}
            {fleetStats.live} live ones carry my commits in the history they were built from.
            Listings read {storeGeneratedAt}; re-run <code>npm run gen:store</code> to refresh them.
          </p>
        </section>
      </main>
    </div>
  );
}
