import { Star, Download, ExternalLink } from "lucide-react";
import { storeApps, storeGeneratedAt, whiteLabelFlavours } from "./data/store.ts";

/**
 * The apps you can actually install.
 *
 * Everything else on this site is a claim about work; this is the work, on the
 * Play Store, with its live rating and install count next to it. The package
 * ids are mined from the `applicationId` lines in each repo's product flavours
 * and verified against the live listing at generation time (scripts/gen-store.mjs)
 * — nothing here is typed from memory, and an id that stops resolving is dropped
 * rather than shipped as a dead link.
 *
 * The white-label line is the part worth reading twice. Four white-label
 * flavours exist in the Jugnoo repos and NONE of them are separately published,
 * because each client ships under its own package id. Dice makes the same point
 * from the other side: one binary, tenanted at runtime. So the honest way to
 * show white-labelling is a count of flavours and an explanation — not four
 * store links that would 404.
 */
export function ShippedShelf() {
  // No length guard: storeApps is `as const`, so TypeScript knows its exact
  // length and a `=== 0` check is a comparison it can prove false. The
  // generator already refuses to write an empty shelf (it throws rather than
  // ship one), so the empty case cannot reach here.
  return (
    <section id="shipped" className="border-t border-line">
      <div className="section-y mx-auto max-w-5xl px-6">
        <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">
          // on the store
        </p>
        <h2 className="font-display text-section font-bold tracking-tight">Apps you can install</h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Shipped Android work, live on Google Play. Ratings and install counts are read from the
          listings themselves, not quoted.
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
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {app.employer}
                </span>
                <span className="font-display mt-2 text-lg font-bold transition group-hover:text-accent">
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

        <p className="mt-6 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
          {whiteLabelFlavours.length} white-label flavours also live in these repos and are
          deliberately absent above: each client ships under its own package id, so there is no one
          listing to link. Dice makes the same point from the other direction — a single binary,
          tenanted at runtime, so nobody forks the app to brand it.{" "}
          <span className="text-zinc-500">Listings read {storeGeneratedAt}.</span>
        </p>
      </div>
    </section>
  );
}
