import { Link } from "@tanstack/react-router";
import { Star, Download, ExternalLink, ArrowRight } from "lucide-react";
import { storeApps, fleet, delisted, fleetStats } from "./data/store.ts";
import { AppIcon } from "./ShippedTile.tsx";
import { compact } from "./shippedFormat.ts";

/** Icons in the wall. Enough to read as a crowd, few enough to stay one block. */
const WALL = 32;

/**
 * One icon per company, not per app.
 *
 * Nearly every client shipped a matched pair — a rider app and a driver app —
 * with the same logo on both. Taking the first 32 apps
 * therefore drew about sixteen brands twice, which reads as a rendering bug
 * rather than as sixteen companies. Key on the publisher where Play gives one,
 * and otherwise on the package id with the side and the platform's namespace
 * stripped off: `product.driver.superfix` and `product.customer.superfix` both
 * become `superfix`.
 */
function oneIconPerBrand<T extends { id: string; developer?: string | null }>(apps: T[]): T[] {
  const seen = new Set<string>();
  return apps.filter((a) => {
    const key = (
      a.developer ??
      a.id
        .replace(/^(product|production|products|com|io|app)\./, "")
        .replace(/(^|\.)(customer|driver|rider|user|partner)(\.|$)/g, ".")
    )
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The apps you can actually install — the homepage summary.
 *
 * Everything else on this site is a claim about work. This is the work, on the
 * Play Store, with its live rating and install count beside it, and nothing here
 * is typed from memory (see scripts/gen-store.mjs).
 *
 * DELIBERATELY NOT A WALL OF NUMBERS. An earlier version of this section led
 * with the size of the raw candidate set — north of a thousand client ids —
 * which is the most interesting fact about the DATA and close to the least
 * interesting thing about the person who worked on it. A visitor wants to know
 * what shipped and whether they can open it. The provenance, the counts and the method are one
 * click away at /shipped, where someone who cares how the list was built can go
 * and check it. The icons carry the argument here: thirty-odd app icons, all
 * different, all the same two codebases.
 */
export function ShippedShelf() {
  const reached = fleetStats.live + delisted.length;
  const wall = oneIconPerBrand([...fleet, ...delisted].filter((a) => a.icon)).slice(0, WALL);

  return (
    <section id="shipped" className="border-t border-line">
      <div className="section-y mx-auto max-w-5xl px-6">
        <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">
          // on the store
        </p>
        <h2 className="font-display text-h2 font-bold tracking-tight">Apps you can install</h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Shipped Android work, live on Google Play. Every rating and install count below was read
          from the listing itself, not quoted.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {storeApps.map((app) => (
            <li key={app.id}>
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition hover:-translate-y-1 hover:border-accent"
              >
                <AppIcon app={app} size={44} />
                <span className="kicker mt-4">
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

        {/* ── The fleet, as a crowd rather than a table ──────────────────── */}
        <div className="mt-14 border-t border-line pt-10">
          <h3 className="font-display text-xl font-bold tracking-tight">
            …and {reached - storeApps.length} more, under other people&rsquo;s names
          </h3>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            The Jugnoo rider and driver apps were a white-label platform: every client got its own
            build of the same codebase, its own branding, and its own listing on Play under its own
            company. I worked on it for two and a half years and never had a list of what came out
            of it — so I put one together, and kept only the apps the store itself shows were still
            shipping while I was there or after.
          </p>

          {/* The card is a container; the SENTENCE is the link, stretched over
              the card by a pseudo-element so the whole block stays clickable.
              It used to be one <Link> wrapping everything with an aria-label,
              which is two problems: a screen reader either announced the label
              and lost the three statistics, or (with the label removed)
              announced "173 apps reached the store 4 companies published them
              ≥500K installs..." as the NAME OF A LINK. axe flags the first as
              WCAG 2.5.3 — an accessible name has to contain the visible label,
              and the visible label of that element was all of it. Now the
              stats are read as the content they are, and the link is called
              what it says. */}
          <div className="group relative mt-8 rounded-2xl border border-line bg-card/40 p-6 transition hover:border-accent">
            {/* Not links individually — a wall of 32 competing hit targets in a
                summary is noise. The whole block goes to /shipped, where each
                icon becomes its own link with a name and a store page. */}
            <ul aria-hidden className="flex flex-wrap gap-2">
              {wall.map((app) => (
                <li key={app.id}>
                  <AppIcon app={app} size={34} />
                </li>
              ))}
              <li className="font-display grid h-[34px] place-items-center rounded-[22%] border border-dashed border-line px-2 text-[11px] text-muted">
                +{reached - wall.length}
              </li>
            </ul>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              {[
                [String(reached), "apps reached the store"],
                [String(fleetStats.developers), "companies published them"],
                [`≥ ${compact(fleetStats.installFloor)}`, "installs across the live ones"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-3xl font-bold tabular-nums text-accent">
                    {value}
                  </dt>
                  <dd className="mt-1 text-xs leading-relaxed text-muted">{label}</dd>
                </div>
              ))}
            </dl>

            <Link
              to="/shipped"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 transition after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-accent"
            >
              See all {reached} apps, and how the list was rebuilt
              <ArrowRight size={15} aria-hidden className="transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
