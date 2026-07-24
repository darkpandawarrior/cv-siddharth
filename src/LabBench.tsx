import { useEffect, useState } from "react";
import { Reveal } from "./Reveal.tsx";
import { SignalLabPane } from "./labs/SignalLab.tsx";
import { CrashLab } from "./labs/CrashLab.tsx";
import { RecomposeLab } from "./labs/RecomposeLab.tsx";
import { ThemeLab } from "./labs/ThemeLab.tsx";
import { ModuleGraphLab } from "./labs/ModuleGraphLab.tsx";
import { GatewayLab } from "./labs/GatewayLab.tsx";
import { SearchTreeLab } from "./labs/SearchTreeLab.tsx";
import { FanoutLab } from "./labs/FanoutLab.tsx";
import { ReplayLab } from "./labs/ReplayLab.tsx";

/**
 * The Lab Bench — one live experiment per case study. Not screenshots of
 * the work: the ideas themselves, running. Tabs mount one lab at a time so
 * the section stays light; every case-study card deep-links to its lab via
 * openLab().
 */

export type LabKey =
  | "signal"
  | "crashes"
  | "recompose"
  | "theme"
  | "modules"
  | "gateways"
  | "search"
  | "fanout"
  | "replay";

const OPEN_LAB_EVENT = "open-lab";
// The Lab Bench now lives on its own #lab route (inside the Playground hub), so
// a deep-link from a case-study card navigates there and hands the desired tab
// across — via an event if the bench is already mounted, or this pending slot
// for a fresh mount after the route change.
let pendingLab: LabKey | null = null;
export function openLab(tab: LabKey) {
  pendingLab = tab;
  window.dispatchEvent(new CustomEvent(OPEN_LAB_EVENT, { detail: tab }));
  if (window.location.hash !== "#lab") {
    window.scrollTo({ top: 0 });
    window.location.hash = "#lab";
  }
}

/* ── The bench ───────────────────────────────────────────────────────── */

const TABS: { key: LabKey; label: string; metric: string; group: "production" | "personal" }[] = [
  { key: "signal", label: "Signal Lab", metric: "50% → 95%", group: "production" },
  { key: "crashes", label: "Crash Triage", metric: "-80%", group: "production" },
  { key: "recompose", label: "Recomposition", metric: "92% Compose", group: "production" },
  { key: "theme", label: "White-label", metric: "80% faster", group: "production" },
  { key: "modules", label: "Module Graph", metric: "46 modules", group: "personal" },
  { key: "gateways", label: "Gateway Lab", metric: "66 gateways", group: "personal" },
  { key: "search", label: "Search Tree", metric: "10 personas", group: "personal" },
  { key: "fanout", label: "Provider Fan-out", metric: "62 providers", group: "personal" },
  { key: "replay", label: "Deterministic Replay", metric: "0-tolerance", group: "personal" },
];

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
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the lab bench</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Don't take the numbers on faith</h2>
          <p className="mb-8 max-w-2xl text-zinc-400">
            Nine instruments spanning Dice.tech's production case studies and five personal open-source
            builds — the actual idea behind each headline metric, running live in your browser. Flip a
            switch and watch the number happen. Every other room is one door away in
            the <a href="#playground" onClick={() => window.scrollTo({ top: 0 })} className="text-accent transition hover:text-accent-dim">Playground</a>.
          </p>
        </Reveal>
        <Reveal>
          <div className="mb-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 font-mono">Dice.tech — production</p>
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
                  <span className={`font-mono text-[10px] ${tab === t.key ? "text-accent/80" : "text-zinc-600"}`}>{t.metric}</span>
                </button>
              ))}
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 font-mono">Personal builds</p>
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
                  <span className={`font-mono text-[10px] ${tab === t.key ? "text-accent/80" : "text-zinc-600"}`}>{t.metric}</span>
                </button>
              ))}
            </div>
          </div>
          {tab === "signal" && <SignalLabPane />}
          {tab === "crashes" && <CrashLab />}
          {tab === "recompose" && <RecomposeLab />}
          {tab === "theme" && <ThemeLab />}
          {tab === "modules" && <ModuleGraphLab />}
          {tab === "gateways" && <GatewayLab />}
          {tab === "search" && <SearchTreeLab />}
          {tab === "fanout" && <FanoutLab />}
          {tab === "replay" && <ReplayLab />}
        </Reveal>
      </div>
    </section>
  );
}
