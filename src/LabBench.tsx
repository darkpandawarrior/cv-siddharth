import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Reveal } from "./Reveal.tsx";
// ponytail: SignalLab pulls in leaflet, which touches `window` at module-load
// time — harmless client-side, fatal during SSR. Lazy-loading defers that eval
// to the client, same pattern as BlueprintRoom/ComposePlayground in App.tsx.
// The reason recorded here used to be "the home route imports LabBench for
// openLab/LabKey"; it no longer does — that signal moved to data/labs.ts — but
// /lab is itself server-rendered, so the hazard is unchanged.
const SignalLabPane = lazy(() => import("./labs/SignalLab.tsx").then((m) => ({ default: m.SignalLabPane })));
// ponytail: same treatment, different cost. ChessSearchLab reaches the chess
// engine worker; a static import would put the worker chunk's entry (and
// chess.js behind it) on the critical path of anyone opening /lab, whichever
// of the eleven instruments they came for.
const ChessSearchLab = lazy(() => import("./labs/ChessSearchLab.tsx").then((m) => ({ default: m.ChessSearchLab })));
import { CrashLab } from "./labs/CrashLab.tsx";
import { RecomposeLab } from "./labs/RecomposeLab.tsx";
import { ThemeLab } from "./labs/ThemeLab.tsx";
import { ModuleGraphLab } from "./labs/ModuleGraphLab.tsx";
import { GatewayLab } from "./labs/GatewayLab.tsx";
import { SearchTreeLab } from "./labs/SearchTreeLab.tsx";
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

  // ponytail: lazy() does NOT keep a chunk off the server — React resolves a
  // lazy child while streaming, and SignalLab's leaflet import touches
  // `window` at module scope, which killed the whole /lab render. One mount
  // flag holds both browser-only panes back to the client; the fallback each
  // already had becomes the server's markup.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    clearPendingLab(); // consumed by the initial state above
    return onOpenLab(setTab);
  }, []);

  return (
    <section id="lab" className="border-t border-line bg-void/40">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the lab bench</p>
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
                  <span className={`font-mono text-[10px] ${tab === t.key ? "text-accent/80" : "text-muted"}`}>{t.metric}</span>
                </button>
              ))}
            </div>
          </div>
          {tab === "signal" && (
            <Suspense fallback={<PaneFallback what="signal lab" />}>
              {mounted ? <SignalLabPane /> : <PaneFallback what="signal lab" />}
            </Suspense>
          )}
          {tab === "crashes" && <CrashLab />}
          {tab === "recompose" && <RecomposeLab />}
          {tab === "theme" && <ThemeLab />}
          {tab === "modules" && <ModuleGraphLab />}
          {tab === "gateways" && <GatewayLab />}
          {tab === "search" && <SearchTreeLab />}
          {tab === "fanout" && <FanoutLab />}
          {tab === "replay" && <ReplayLab />}
          {tab === "chess-search" && (
            <Suspense fallback={<PaneFallback what="chess engine" />}>
              {mounted ? <ChessSearchLab /> : <PaneFallback what="chess engine" />}
            </Suspense>
          )}
          {tab === "chess-clock" && <ClockLab />}
        </Reveal>
      </div>
    </section>
  );
}
