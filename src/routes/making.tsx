import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { SiteFooter } from "../SiteFooter.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { Reveal } from "../Reveal.tsx";
import { Picture } from "../Picture.tsx";
import { ChapterWord, GiantCTA } from "../Editorial.tsx";
import { anthology } from "../data/anthology.ts";
import { RENDERINGS, SEASON_CANON } from "../data/canonLore.ts";
import {
  AUDIT_METHOD,
  PIPELINE_STAGES,
  PORTRAIT_ITERATIONS,
  RECEIPTS,
  RETROACTION_STANDARD,
  S2_AUDIT_KILLS,
  S2_MISSING_BEAT,
  S2_NEGATIVE_CONTROL,
  S3_FIRST_DESIGN,
  S4_FENCE,
  SPEND,
  VOICE_CONSTRAINTS,
} from "../data/making.ts";

/**
 * /making, "The Making". The craft record for The Morkinstar Journals, kept
 * on the one surface that is allowed to have an author.
 *
 * WHY THIS EXISTS. An audit found production process printed inside the
 * fiction: a note on /canon conceding "that was the prompting, not the
 * model", a Sources list whose links opened on the working authoring bibles,
 * and a machine tag left at the end of a published story. All of it was
 * removed from the fiction surfaces and none of it was thrown away. The
 * ruling: kill records are impressive evidence on a surface about the making
 * and derivative sounding inventory on a surface about the world. Same
 * table, different room. This is the other room.
 *
 * DATA vs PRESENTATION. Every fact is in `src/data/making.ts`, lifted from
 * the-loopdown's own working files. This file holds layout only.
 *
 * REACHABILITY, one way only. This route is registered in `surfaces.ts`'s
 * `proof` group, which is the entire mechanism: the homepage wall, the
 * command palette (mounted globally in __root.tsx, so it is present on
 * /hire and /loopdown too) and the footer's registry driven "Rooms" column
 * (present on the fiction pages, because SiteFooter is) all reach this route
 * for free, with no route file anywhere hand linking to it. No fiction
 * surface links here: `fictionLinkTargets.test.ts` asserts that in the other
 * direction. The order of doors is one way, the making of links into the
 * fiction below, the fiction never links out to this page.
 *
 * THE SPOILER GATE. Reused, not reinvented: Season Two's and Season Three's
 * gated blocks below print the exact same `SEASON_CANON[n].spoils` string
 * /canon already gates its own doctrine behind, inside the same closed
 * `<details>` pattern. Season Four has not shipped an entry yet, so it has no
 * row in that registry: its own gate is authored here instead, and it is the
 * most closed door on the page for exactly that reason.
 *
 * COLOUR. Every token below is the site's own default palette (this route is
 * never wrapped in `.ink-world`, because it is a portfolio surface and not a
 * lore one), and no new colour is introduced. Most of index.css's inline
 * annotations on this token block are usage FREQUENCIES from a pre-migration
 * receipt, not contrast ratios (its own docstring says so), so the ratios
 * this page actually needs are computed here against the grounds it actually
 * uses, `--color-ink` (#0a0d0c) and `--color-card` (#171c1a):
 *   --color-accent    9.24:1 on ink (index.css's own documented figure), 8.17:1 on card
 *   --color-text      14.75:1 on card
 *   --color-text-dim  9.94:1 on card
 *   --color-muted     5.38:1 on card (index.css separately documents >=4.5:1 on every
 *                      dark ground the site ships, this is the specific figure for this one)
 *   --color-danger    6.45:1 on ink, 5.7:1 on card. Passes AA for normal text with a
 *                      real margin, unlike the ink-world's own --color-danger variant,
 *                      which canon.tsx's own colour note measures at 4.49:1 and refuses
 *                      to use as text for exactly that reason.
 * All five clear 4.5:1, the AA floor for normal text, which is what
 * lighthouserc.json's accessibility:1.00 assertion is checking.
 */
export const Route = createFileRoute("/making")({
  head: () => roomHead("/making"),
  component: MakingRoute,
});

const money = (n: number) => `$${n.toFixed(2)}`;

/** One row of a kill table: the premise, what it was named as, and its fate. */
function KillRow({ premise, namedAs, fate }: { premise: string; namedAs: string; fate: "killed" | "rebuilt" }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-base font-bold" style={{ color: "var(--color-text)" }}>
          {premise}
        </p>
        {/* --color-danger on bg-card: 5.7:1, computed (see the COLOUR note at
            the top of this file). Clears the 4.5:1 AA floor for this text
            size, and the word "killed" itself carries the meaning, so the
            colour is reinforcement rather than the only channel. */}
        <span
          className="kicker"
          style={{ color: fate === "killed" ? "var(--color-danger)" : "var(--color-text-dim)" }}
        >
          {fate}
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        {namedAs}
      </p>
    </div>
  );
}

function MakingRoute() {
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> Portfolio
          </Link>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="section-y mx-auto max-w-5xl px-6">
          {/* ---- 0. Masthead --------------------------------------------- */}
          <Reveal>
            <p className="kicker-accent">// the craft record, not the fiction</p>
            <h1 className="font-display mt-3 text-hero">The Making</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--color-text)" }}>
              The Morkinstar Journals reads as a correspondent with no author. This page is where the
              author is. Everything below used to be scattered across the fiction itself, a line here, a
              link there, and it read as production apparatus left inside the lore. It has been moved, not
              deleted: the audits, what they killed, the two portrait passes, the voice rules and what the
              whole thing cost.
            </p>
          </Reveal>

          {/* ---- 1. The ownership audit, method only --------------------- */}
          <Reveal className="mt-16">
            <section aria-labelledby="audit-h">
              <h2 id="audit-h" className="font-display text-2xl font-bold sm:text-3xl">
                The ownership audit
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {AUDIT_METHOD.send} {AUDIT_METHOD.gate}
              </p>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {AUDIT_METHOD.whyNotSelfAssessed}
              </p>
              <p
                className="font-display mt-6 max-w-2xl border-l-2 pl-5 text-xl leading-snug"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
              >
                {AUDIT_METHOD.summary}
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                Negative control, so the gate is known to detect real borrowing rather than pattern match
                everything: {S2_NEGATIVE_CONTROL}
              </p>
            </section>
          </Reveal>

          {/* ---- 2. The portraits, twice ----------------------------------
              Reuses the same four plates /canon already shows as evidence for
              The Rendering. Nothing here spoils: that doctrine is already
              open canon, and these are the same public images. */}
          <Reveal className="mt-16">
            <section aria-labelledby="portraits-h">
              <h2 id="portraits-h" className="font-display text-2xl font-bold sm:text-3xl">
                The portraits, twice
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                First set: {PORTRAIT_ITERATIONS.firstSet.verdict}
              </p>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {PORTRAIT_ITERATIONS.firstFix}
              </p>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {RENDERINGS.map((r) => {
                  const w = anthology.witnesses.find((x) => x.id === r.witnessId);
                  if (!w) return null;
                  return (
                    <figure key={r.state} className="overflow-hidden rounded-2xl border border-line bg-card">
                      <Picture
                        src={w.art}
                        alt={`${w.name}, rendered. ${r.note}`}
                        width={1100}
                        height={600}
                        className="w-full object-cover"
                      />
                      <figcaption className="border-t border-line p-4">
                        <span className="kicker-accent">the rig {r.state}</span>
                        <p className="mt-1 font-display text-sm font-bold" style={{ color: "var(--color-text)" }}>
                          {w.name}
                        </p>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              <p className="mt-8 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {PORTRAIT_ITERATIONS.secondDefect}
              </p>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {PORTRAIT_ITERATIONS.theFix}
              </p>
              <p
                className="mt-4 max-w-2xl rounded-xl border border-line bg-card p-4 font-mono text-sm leading-relaxed"
                style={{ color: "var(--color-text-dim)" }}
              >
                {PORTRAIT_ITERATIONS.trap}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                Redrawn set: the one that shipped.
              </p>
            </section>
          </Reveal>

          {/* ---- 3. The voice ---------------------------------------------- */}
          <Reveal className="mt-16">
            <section aria-labelledby="voice-h">
              <h2 id="voice-h" className="font-display text-2xl font-bold sm:text-3xl">
                The voice, held to its own rule
              </h2>
              <ul className="mt-6 space-y-3">
                {VOICE_CONSTRAINTS.map((v) => (
                  <li
                    key={v.slice(0, 24)}
                    className="border-l-2 pl-4 text-sm leading-relaxed"
                    style={{ borderColor: "var(--color-line)", color: "var(--color-text-dim)" }}
                  >
                    {v}
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>

          {/* ---- 4. The pipeline -------------------------------------------- */}
          <Reveal className="mt-16">
            <section aria-labelledby="pipeline-h">
              <h2 id="pipeline-h" className="font-display text-2xl font-bold sm:text-3xl">
                The pipeline
              </h2>
              <ol className="mt-6 space-y-5">
                {PIPELINE_STAGES.map((s, i) => (
                  <li key={s.step} className="flex gap-4">
                    <span className="font-display text-lg font-bold text-accent">{i + 1}</span>
                    <div>
                      <p className="font-display text-base font-bold" style={{ color: "var(--color-text)" }}>
                        {s.step}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                        {s.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>

          {/* ---- 5. The retroaction standard ------------------------------- */}
          <Reveal className="mt-16">
            <section aria-labelledby="retro-h">
              <h2 id="retro-h" className="font-display text-2xl font-bold sm:text-3xl">
                What is allowed to count as new
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {RETROACTION_STANDARD}
              </p>
            </section>
          </Reveal>

          {/* ---- 6. The spend ------------------------------------------------ */}
          <Reveal className="mt-16">
            <section aria-labelledby="spend-h">
              <h2 id="spend-h" className="font-display text-2xl font-bold sm:text-3xl">
                What it cost
              </h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-3">
                <p className="font-display text-metric font-bold text-accent">
                  {money(SPEND.totalUsd)}
                  <span className="kicker mt-2 block">total, measured</span>
                </p>
                <p className="font-display text-metric font-bold text-accent">
                  {money(SPEND.auditsUsd)}
                  <span className="kicker mt-2 block">on the cross lab audits</span>
                </p>
                <p className="font-display text-metric font-bold text-accent">
                  {money(SPEND.artUsd)}
                  <span className="kicker mt-2 block">on art</span>
                </p>
              </div>
              <p className="mt-6 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {SPEND.note}
              </p>
            </section>
          </Reveal>
        </div>

        {/* ---- THE TURN ---------------------------------------------------
            Same mechanism as /canon: one unmistakable divider, everything
            above it open, everything below it inside a native <details> that
            is shut on first paint and names the price before it is paid. */}
        <ChapterWord>THE TURN</ChapterWord>
        <div className="mx-auto max-w-5xl px-6 pb-24">
          <p className="kicker-accent">
            Below this line: what the audits actually named, and the season that has not shipped an entry
            yet.
          </p>

          <Reveal className="mt-6">
            <details className="expander card-elevated rounded-2xl border border-line bg-card p-6">
              <summary className="cursor-pointer select-none">
                <span className="kicker block">season two, before the audit</span>
                <h2 className="font-display mt-1 text-xl font-bold">The Ninety-One Pages</h2>
                <span className="kicker mt-1 block">this gives away {SEASON_CANON[2].spoils}</span>
              </summary>
              <div className="mt-4">
                {S2_AUDIT_KILLS.map((k) => (
                  <KillRow key={k.premise} {...k} />
                ))}
              </div>
              <p
                className="font-display mt-6 max-w-2xl border-l-2 pl-5 text-lg leading-snug"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-text)" }}
              >
                {S2_MISSING_BEAT}
              </p>
            </details>
          </Reveal>

          <Reveal className="mt-6">
            <details className="expander card-elevated rounded-2xl border border-line bg-card p-6">
              <summary className="cursor-pointer select-none">
                <span className="kicker block">season three, the design that never shipped</span>
                <h2 className="font-display mt-1 text-xl font-bold">The Kindling, v1</h2>
                <span className="kicker mt-1 block">this gives away {SEASON_CANON[3].spoils}</span>
              </summary>
              <p className="mt-4 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {S3_FIRST_DESIGN.premise}
              </p>
              <dl className="mt-5 space-y-4">
                {S3_FIRST_DESIGN.findings.map((f) => (
                  <Fragment key={f.title}>
                    <dt className="font-mono text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
                      {f.title}
                    </dt>
                    <dd className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                      {f.note}
                    </dd>
                  </Fragment>
                ))}
              </dl>
              <p className="mt-6 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {S3_FIRST_DESIGN.replacement}
              </p>
            </details>
          </Reveal>

          <Reveal className="mt-6">
            <details className="expander card-elevated rounded-2xl border border-line bg-card p-6">
              <summary className="cursor-pointer select-none">
                <span className="kicker block">season four, no entries shipped yet</span>
                <h2 className="font-display mt-1 text-xl font-bold">The frame the audit fenced</h2>
                <span className="kicker mt-1 block">this gives away the premise of a season nobody has read</span>
              </summary>
              <p className="mt-4 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                Named as {S4_FENCE.named}. {S4_FENCE.finding}
              </p>
              <p
                className="font-display mt-6 max-w-2xl border-l-2 pl-5 text-lg leading-snug"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-text)" }}
              >
                {S4_FENCE.quote}
              </p>
            </details>
          </Reveal>

          {/* Receipts. The one place on this site allowed to point straight at
              a working file: fictionLinkTargets.test.ts scopes its .md ban to
              the reader facing fiction surfaces, and this is not one. */}
          <div className="mt-10">
            <p className="kicker-accent">receipts</p>
            <ul className="mt-3 space-y-2">
              {RECEIPTS.map((r) => (
                <li key={r.href}>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                  >
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-16">
            <GiantCTA
              label="Read the anthology"
              href="/anthology"
              sub="Everything above is standing on the other side of this door."
            />
          </div>
        </div>
      </main>

      <SiteFooter />
      <FloatingChat />
    </div>
  );
}
