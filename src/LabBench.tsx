import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Reveal } from "./Reveal.tsx";
// ponytail: SignalLab pulls in leaflet, which touches `window` at module-load
// time — harmless client-side, but fatal during SSR now that the home route
// (which imports LabBench for openLab/LabKey) is server-rendered (Task 6).
// Lazy-loading defers that eval to the client, same pattern as BlueprintRoom/
// ComposePlayground in App.tsx.
const SignalLabPane = lazy(() => import("./labs/SignalLab.tsx").then((m) => ({ default: m.SignalLabPane })));
// ponytail: same hazard, second cause. ChessSearchLab reaches the chess
// engine worker; a static import would put the worker chunk's entry (and
// chess.js behind it) on the home page's critical path, since the home route
// imports this file for openLab/LabKey.
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
import { LAB_TABS, countWord, type LabKey } from "./data/labs.ts";

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

const OPEN_LAB_EVENT = "open-lab";
// The Lab Bench now lives on its own /lab route (inside the Playground hub), so
// a deep-link from a case-study card navigates there and hands the desired tab
// across — via an event if the bench is already mounted, or this pending slot
// for a fresh mount after the route change. The actual SPA navigation happens
// at the call site via useNavigate() (router.navigate would need the mounted
// router instance, which isn't available here); this just records the tab and
// notifies an already-mounted bench.
let pendingLab: LabKey | null = null;
export function openLab(tab: LabKey) {
  pendingLab = tab;
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new CustomEvent(OPEN_LAB_EVENT, { detail: tab }));
}

/* ── The bench ───────────────────────────────────────────────────────── */

const TABS = LAB_TABS;

export function LabBench() {
  const [tab, setTab] = useState<LabKey>(() => pendingLab ?? "signal");

  useEffect(() => {
    pendingLab = null; // consumed by the initial state above
    const onOpen = (e: Event) => {
      const t = (e as CustomEvent).detail as LabKey;
      if (TABS.some((x) => x.key === t)) setTab(t);
    };
    window.addEventListener(OPEN_LAB_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LAB_EVENT, onOpen);
  }, []);

  return (
    <section id="lab" className="border-t border-line bg-void/40">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the lab bench</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Don't take the numbers on faith</h2>
          <p className="mb-8 max-w-2xl text-zinc-400">
            {countWord(LAB_TABS.length)} instruments spanning Dice.tech's production case studies and five personal open-source
            builds — the actual idea behind each headline metric, running live in your browser. Flip a
            switch and watch the number happen. Every other room is one door away in
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
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted font-mono">Dice.tech — production</p>
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
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted font-mono">Personal builds</p>
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
            <Suspense fallback={<div className="py-10 text-center font-mono text-sm text-muted">loading signal lab…</div>}>
              <SignalLabPane />
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
            <Suspense fallback={<div className="py-10 text-center font-mono text-sm text-muted">loading chess engine…</div>}>
              <ChessSearchLab />
            </Suspense>
          )}
          {tab === "chess-clock" && <ClockLab />}
        </Reveal>
      </div>
    </section>
  );
}
