import { Link } from "@tanstack/react-router";
import { ArrowLeft, Star, Download, ExternalLink } from "lucide-react";
import {
  storeApps,
  liveClients,
  pastClients,
  delisted,
  fleetStats,
  storeGeneratedAt,
} from "./data/store.ts";
import { AppIcon } from "./ShippedTile.tsx";
import { ShippedClient } from "./ShippedClient.tsx";
import { ShippedTimeline } from "./ShippedTimeline.tsx";
import { compact } from "./shippedFormat.ts";

import { SiteFooter } from "./SiteFooter.tsx";
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
            Three of these I worked on directly, at Dice and at Jugnoo. The other{" "}
            {reached - storeApps.length} are clients of the white-label platform I worked on at
            Jugnoo — each one a separate build of the same two codebases, shipped under its own
            company on Google Play.
          </p>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            I never had a list of them, and nobody there did. This page is that list, put back
            together and then checked one store listing at a time — including {delisted.length} that
            have since been taken down, and can only be shown at all because the Internet Archive
            kept a copy of the page.
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
            The ones I worked on directly
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            Not mine — Dice&rsquo;s and Jugnoo&rsquo;s. These are the products themselves rather
            than a client&rsquo;s build of one, and they are the two teams the rest of this page
            comes out of.
          </p>
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
        </section>

        {/* ── Live ──────────────────────────────────────────────────────── */}
        {/* ── Only what overlaps his time there ─────────────────────────── */}
        <section className="mt-14">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Why these {reached} and not more
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            The platform is older than my time on it, so most of what it ever shipped has nothing to
            do with me. I was at Jugnoo from January 2021 to May 2023, which means an app only
            belongs here if the store shows it still shipping builds in that window or after it —
            either it went out while I was there, or it went out later from a codebase my work is
            in. Every app below clears that line; {fleetStats.predatingHim} others were on the store
            and do not, so they are not counted.
          </p>
          <ShippedTimeline />
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-bold tracking-tight">
            On the store now &mdash; {liveClients.length} companies
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            Grouped by the company that ships them, because nearly every client put out a pair — one
            app for riders, one for drivers. That is {fleetStats.live} listings in all, and every one
            is a link you can open. The rating, install count and update date come from the listing
            itself; the coloured edge is the colour that client&rsquo;s own app was themed in.
          </p>
          {/* grid-cols-1 is load-bearing on mobile: without a base column
              class the track is `auto`, which sizes to the widest card's
              max-content and pushes the page 50px past a 390px viewport. */}
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveClients.map((client) => (
              <li key={client.key}>
                <ShippedClient client={client} />
              </li>
            ))}
          </ul>
        </section>

        {/* ── Pulled ────────────────────────────────────────────────────── */}
        <section className="mt-14">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Pulled since &mdash; {pastClients.length} companies
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            Every one of these was on Google Play and is not any more — clients that closed, moved
            on, or were bought. Google keeps no record of an app once it comes down, so the only
            reason these can be named is that the Internet Archive saved the page while it was up.
            Each link opens the copy it saved.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            The icons and colours are the ones each app actually shipped with, not stand-ins.
          </p>
          {/* grid-cols-1 is load-bearing on mobile: without a base column
              class the track is `auto`, which sizes to the widest tile's
              max-content and pushes the page 50px past a 390px viewport. */}
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pastClients.map((client) => (
              <li key={client.key}>
                <ShippedClient client={client} past />
              </li>
            ))}
          </ul>
        </section>

        {/* ── Method ────────────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-xl font-bold tracking-tight">How I know</h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
            None of this is from memory. Nobody remembers {reached} apps, and a list written from
            recollection is a list you should not trust — so every line of it was rebuilt from
            things that can be checked.
          </p>

          <ol className="mt-8 grid gap-6 sm:grid-cols-2">
            {[
              {
                h: "Every client shipped separately",
                p: "That is what made it a platform rather than a product: one app, rebuilt and rebranded for each client, each with its own name and its own listing. So the work is not one entry on a CV — it is spread across a lot of store pages, under a lot of company names, and none of them are mine.",
              },
              {
                h: "Then Google told me which survived",
                p: `Most never made it out of pilot. ${fleetStats.live} are still on the Play Store, and each one hands over its real name, icon, rating, install count and the company that publishes it. Anything that no longer answers is taken off this page rather than left as a broken link.`,
              },
              {
                h: "And the Archive remembered the rest",
                p: `An app that was taken down and an app that never existed look identical on Play — both are a dead link. The Internet Archive can tell them apart, because it kept a copy of the listing while it was up. That is the only reason ${delisted.length} of these can be named at all.`,
              },
              {
                h: "What I left out",
                p: `${fleetStats.predatingHim} apps that were genuinely published, but whose last build went out before I joined — I cannot have written a line in them. One with a million installs that came off the same platform two years before I arrived. Anything that was a demo or a template rather than a real client. And anything a former employer would reasonably consider theirs.`,
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
            marks the {fleetStats.setUpByHim + delisted.filter((a) => a.setUpByHim).length} I set up
            myself. {fleetStats.carryingHisCommits} of the {fleetStats.live} live ones are builds of
            an app I worked on. Listings read {storeGeneratedAt}.
          </p>
        </section>
      </main>
      {/* surfaces.ts types this a "page"-kind surface, and the registry
          docs promise those get the footer. These two were the exceptions:
          ordinary scroll pages that dead-ended with no sitemap out. */}
      <SiteFooter />
    </div>
  );
}
