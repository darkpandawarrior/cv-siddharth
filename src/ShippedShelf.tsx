import { useState } from "react";
import { Star, Download, ExternalLink } from "lucide-react";
import { storeApps, fleet, fleetStats, storeGeneratedAt } from "./data/store.ts";

/** How many fleet apps to show before the visitor asks for the rest. */
const PREVIEW = 18;

/** 2920170 → "2.9M". Install counts are Play's buckets, so this is a floor. */
function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/**
 * The apps you can actually install.
 *
 * Everything else on this site is a claim about work. This is the work, on the
 * Play Store, with its live rating and install count beside it — and none of it
 * is typed from memory: every package id is mined out of a git history and
 * verified against the live listing at generation time (scripts/gen-store.mjs),
 * and anything that stops resolving is dropped rather than shipped as a dead link.
 *
 * The fleet below the three cards is the part worth reading twice. Jugnoo's
 * white-label platform gives every client its own branch, so the rider and
 * driver repos carry ~1,600 of them, each with its own applicationId. Mining all
 * of them turns "I worked on a white-label platform" — a sentence anyone can
 * type — into a number that can be checked one link at a time.
 */
export function ShippedShelf() {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? fleet : fleet.slice(0, PREVIEW);

  // No length guards: both lists are `as const`, so TypeScript knows their exact
  // length and a `=== 0` check is a comparison it can prove false. The generator
  // already refuses to write an empty shelf — it throws rather than ship one.
  return (
    <section id="shipped" className="border-t border-line">
      <div className="section-y mx-auto max-w-5xl px-6">
        <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">
          // on the store
        </p>
        <h2 className="font-display text-section font-bold tracking-tight">Apps you can install</h2>
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

        {/* ── The fleet ─────────────────────────────────────────────────── */}
        <div className="mt-14 border-t border-line pt-10">
          <h3 className="font-display text-xl font-bold tracking-tight">
            …and {fleetStats.live} more, under other people&rsquo;s names
          </h3>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            The Jugnoo rider and driver apps are a white-label platform, and the way that platform
            works is that every client gets a branch. Those two repos carry{" "}
            <strong className="font-semibold text-zinc-200">
              {fleetStats.branches.toLocaleString("en-IN")} of them
            </strong>{" "}
            between them — {fleetStats.clients.toLocaleString("en-IN")} distinct client package ids.
            Most are demos, pilots and clients long since gone. These{" "}
            {fleetStats.live} are still on the store today, and you can open any of them.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            {[
              [fleetStats.clients.toLocaleString("en-IN"), "client builds in the repos"],
              [String(fleetStats.live), "still live on Play"],
              [`≥ ${compact(fleetStats.installFloor)}`, "installs across them"],
              [String(fleetStats.setUpByHim), "he set up himself"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-display text-3xl font-bold tabular-nums text-accent">{value}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">{label}</dd>
              </div>
            ))}
          </dl>

          <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((app) => (
              <li key={app.id}>
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={app.id}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-card/60 px-3 py-2.5 transition hover:border-accent"
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${app.setUpByHim ? "bg-accent" : "bg-zinc-700"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium transition group-hover:text-accent">
                      {app.name}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-wider text-muted">
                      {app.side}
                      {app.installs ? ` · ${app.installs}` : ""}
                      {app.rating !== null ? ` · ${app.rating.toFixed(1)}★` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          {fleet.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-5 rounded-full border border-line px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
            >
              {expanded ? "Show fewer" : `Show all ${fleet.length}`}
            </button>
          )}

          <p className="mt-6 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
            <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-accent align-middle" />{" "}
            marks the {fleetStats.setUpByHim} whose client package id he added himself;{" "}
            {fleetStats.carryingHisCommits} of the {fleetStats.live} carry his commits in the history
            they were built from. Install counts are Play&rsquo;s own buckets, so the total is a
            floor, not an estimate. Listings read {storeGeneratedAt}.
          </p>
        </div>
      </div>
    </section>
  );
}
