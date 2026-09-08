import { useEffect, useState } from "react";
import { Link, ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { Reveal } from "./Reveal.tsx";
// ponytail: SignalLab pulls in leaflet, which touches `window` at module-load
// time — harmless client-side, fatal during SSR. `<ClientOnly>` below defers
// that eval to the client, same pattern as BlueprintRoom/ComposePlayground in
// App.tsx. The reason recorded here used to be "the home route imports
// LabBench for openLab/LabKey"; it no longer does — that signal moved to
// data/labs.ts — but /lab is itself server-rendered, so the hazard is
// unchanged.
import { SignalLabPane } from "./labs/SignalLab.tsx";
import { CrashLab } from "./labs/CrashLab.tsx";
import { RecomposeLab } from "./labs/RecomposeLab.tsx";
import { ThemeLab } from "./labs/ThemeLab.tsx";
import { ModuleGraphLab } from "./labs/ModuleGraphLab.tsx";
import { GatewayLab } from "./labs/GatewayLab.tsx";
// SearchTreesLab (merged Gaddi ISMCTS + real alpha-beta engine) does its own
// nested deferred boundary around the chess-engine-worker half — see
// SearchTreeLab.tsx — so importing it here statically costs nothing extra:
// the worker/chess.js chunk only loads once a visitor flips the in-pane
// radiogroup to "real".
import { SearchTreesLab } from "./labs/SearchTreeLab.tsx";
import { FanoutLab } from "./labs/FanoutLab.tsx";
import { ReplayLab } from "./labs/ReplayLab.tsx";
// Static: ClockLab reads data/chess.ts and nothing else — no engine, no worker.
import { ClockLab } from "./labs/ClockLab.tsx";
import { LAB_TABS, countWord, openLab, peekPendingLab, clearPendingLab, onOpenLab, type LabKey } from "./data/labs.ts";

/**
 * The Lab Bench — one live experiment per case study. Not screenshots of
 * the work: the ideas themselves, running. Tabs mount one lab at a time so
 * the section stays light; every case-study card deep-links to its lab via
 * openLab().
 *
 * The tab registry itself lives in data/labs.ts (plain data, SSR-safe) so the
 * four other places that quote the instrument count can derive it.
 */

export type { LabKey };
// Re-exported so the /lab route and anything else already reaching for the
// bench keeps one import. The signal itself now lives in data/labs.ts beside
// the registry: App.tsx wants openLab and nothing else, and taking it from
// here meant every homepage visitor downloaded the whole bench to set a string.
export { openLab };

/** Shared by the two browser-only panes: their Suspense fallback is also what
 *  the server renders in their place. One shape, so the swap is invisible. */
function PaneFallback({ what }: { what: string }) {
  return <div className="py-10 text-center font-mono text-sm text-muted">loading {what}…</div>;
}

/* ── The bench ───────────────────────────────────────────────────────── */

const TABS = LAB_TABS;

export function LabBench() {
  const [tab, setTab] = useState<LabKey>(() => peekPendingLab() ?? "signal");

  useEffect(() => {
    clearPendingLab(); // consumed by the initial state above
    return onOpenLab(setTab);
  }, []);

  return (
    <section id="lab" className="border-t border-line bg-void/40">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2">// the lab bench</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Don't take the numbers on faith</h2>
          <p className="mb-8 max-w-2xl text-zinc-400">
            {countWord(LAB_TABS.length)} instruments spanning Dice.tech's production case studies, five personal open-source
            builds and seven years of chess — the actual idea behind each headline metric, running live in
            your browser. Flip a switch and watch the number happen. Every other room is one door away in
            the{" "}
            <Link
              to="/playground"
              className="text-accent underline decoration-accent/40 underline-offset-2 transition hover:text-accent-dim hover:decoration-accent-dim"
            >
              Playground
            </Link>
            .
          </p>
        </Reveal>
        <Reveal>
          <div className="mb-2">
            <p className="kicker mb-2 font-semibold">Dice.tech — production</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {TABS.filter((t) => t.group === "production").map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                    tab === t.key
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                  {t.featured && (
                    <span className="rounded-full border border-accent/40 px-1.5 py-px text-[9px] font-mono uppercase tracking-wider text-accent/80">
                      start here
                    </span>
                  )}
                  <span className={`font-mono text-[10px] ${tab === t.key ? "text-accent/80" : "text-muted"}`}>{t.metric}</span>
                </button>
              ))}
            </div>
            <p className="kicker mb-2 font-semibold">Personal builds</p>
            <div className="mb-6 flex flex-wrap gap-2">
              {TABS.filter((t) => t.group === "personal").map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                    tab === t.key
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                  {t.featured && (
                    <span className="rounded-full border border-accent/40 px-1.5 py-px text-[9px] font-mono uppercase tracking-wider text-accent/80">
                      start here
                    </span>
                  )}
                  <span className={`font-mono text-[10px] ${tab === t.key ? "text-accent/80" : "text-muted"}`}>{t.metric}</span>
                </button>
              ))}
            </div>
          </div>
          {tab === "signal" && (
            // /lab server-renders and `tab === "signal"` is a runtime-only
            // switch the bundler can't see through — it still resolved
            // SignalLab's leaflet import for SSR regardless. `<ClientOnly>`
            // is what Start's compiler recognises to strip this subtree from
            // the SERVER compile entirely; `<Hydrate when={load()} split>`
            // inside it keeps SignalLabPane in its own chunk, fetched once
            // this boundary is reached, now that the import above is static.
            <ClientOnly fallback={<PaneFallback what="signal lab" />}>
              <Hydrate when={load()} split fallback={<PaneFallback what="signal lab" />}>
                <SignalLabPane />
              </Hydrate>
            </ClientOnly>
          )}
          {tab === "crashes" && <CrashLab />}
          {tab === "recompose" && <RecomposeLab />}
          {tab === "theme" && <ThemeLab />}
          {tab === "modules" && <ModuleGraphLab />}
          {tab === "gateways" && <GatewayLab />}
          {tab === "search-trees" && <SearchTreesLab />}
          {tab === "fanout" && <FanoutLab />}
          {tab === "replay" && <ReplayLab />}
          {tab === "chess-clock" && <ClockLab />}
        </Reveal>
      </div>
    </section>
  );
}
