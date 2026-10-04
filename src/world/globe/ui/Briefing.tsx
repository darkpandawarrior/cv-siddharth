import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getLiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
import { useGlobe } from "../globeStore.ts";
import { QUAKES_URL, EONET_URL, KP_URL } from "../layers/feedUrls.ts";
import { issCandidate } from "./surpriseMe.ts";
import { propagateState, type TleObject } from "../../../lib/satelliteEcef.ts";
import { tleEpoch } from "../../../lib/satellites.ts";
import { inspectBriefingSatellite, satelliteBriefingSelection } from "./feedItemSelection.ts";
import { briefingLaunchSnapshot, buildBriefing } from "./briefing.ts";

import { useOverflowHost } from "./overflowHost.ts";

const buttonClass = "min-h-11 min-w-11 rounded-full border border-line px-3 text-sm text-zinc-100 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export default function Briefing() {
  const overflow = useOverflowHost();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [triggerBox, setTriggerBox] = useState<{ bottom: number; right: number }>();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sheet = useGlobe(s => s.sheet);
  const layers = useGlobe(s => s.layers);
  const status = useGlobe(s => s.status);
  const offset = useGlobe(s => s.timeOffsetMin);
  const [phone, setPhone] = useState(() => getComputedStyle(document.documentElement).getPropertyValue("--globe-compact").trim() === "1");
  const open = phone ? sheet === "brief" : desktopOpen;
  useEffect(() => {
    const update = () => setPhone(getComputedStyle(document.documentElement).getPropertyValue("--globe-compact").trim() === "1");
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    closeButton.current?.focus();
    const measure = () => { const box = trigger.current?.getBoundingClientRect(); const topbar = trigger.current?.closest("[data-globe-topbar]")?.getBoundingClientRect(); if (box) setTriggerBox({ right: box.right, bottom: topbar?.bottom ?? box.bottom }); };
    window.addEventListener("resize", measure);
    return () => { clearInterval(timer); window.removeEventListener("resize", measure); };
  }, [open]);
  const close = () => {
    setDesktopOpen(false);
    if (useGlobe.getState().sheet === "brief") useGlobe.getState().setSheet(null);
    (trigger.current?.closest("details")?.querySelector<HTMLElement>("summary") ?? trigger.current)?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDesktopOpen(false);
      if (useGlobe.getState().sheet === "brief") useGlobe.getState().setSheet(null);
      (trigger.current?.closest("details")?.querySelector<HTMLElement>("summary") ?? trigger.current)?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const snapshot = (url: string) => getLiveSignalSnapshot<unknown>(url);
  const tle = getLiveSignalSnapshot<{ connected: boolean; epochNewest: string | null; objects: TleObject[] }>("/api/tle");
  const issObject = tle.data?.objects?.find(object => object.norad === "25544");
  const epoch = issObject ? tleEpoch(issObject.l1).getTime() : NaN;
  const satelliteReason = !layers.satellites ? "Satellites layer is off" : offset !== 0 ? "Position unavailable during time travel" : tle.error || status.satellites?.state === "failed" ? "Latest TLE request failed" : !Number.isFinite(epoch) || nowMs - epoch > 7 * 86_400_000 || epoch > nowMs ? "TLE epoch missing or stale (7 d limit)" : "Waiting for a registered ISS position";
  const iss = layers.satellites && offset === 0 && !tle.error && tle.data?.connected && Number.isFinite(epoch) && epoch <= nowMs && nowMs - epoch <= 7 * 86_400_000 ? issCandidate()?.selection ?? null : null;
  const issState = issObject && iss ? propagateState(issObject, new Date(nowMs)) : null;
  const issSelection = iss && issObject && issState ? satelliteBriefingSelection(issObject, issState) : null;
  let storage: Storage | undefined;
  try { storage = window.sessionStorage; } catch { /* Storage can be disabled. */ }
  const result = buildBriefing({ nowMs, quakes: snapshot(QUAKES_URL), eonet: snapshot(EONET_URL), gvp: snapshot("/api/volcanoes"), kp: snapshot(KP_URL), iss: issSelection, satelliteReason: iss && !issState ? "ISS element is stale or cannot be propagated" : satelliteReason, launches: briefingLaunchSnapshot(nowMs, storage, status.hazards?.detail?.includes("Launch Library unreachable")) });
  const panel = open ? (
    <section id="globe-briefing" data-globe-briefing role="region" aria-labelledby="globe-brief-title" style={phone ? { maxHeight: `min(70svh, ${Math.max(0, window.innerHeight - (triggerBox?.bottom ?? 0) - 8)}px)` } : { top: Math.min((triggerBox?.bottom ?? 0) + 8, window.innerHeight - 128), maxHeight: `min(65vh, ${Math.max(120, window.innerHeight - (triggerBox?.bottom ?? 0) - 16)}px)`, left: Math.max(16, Math.min((triggerBox?.right ?? window.innerWidth - 16) - 320, window.innerWidth - 336)) }} className={phone ? "pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex max-h-[70svh] flex-col rounded-t-2xl glass-panel text-zinc-200" : "pointer-events-auto fixed z-40 flex max-h-[65vh] w-80 flex-col rounded-2xl glass-panel text-zinc-200"}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line p-3">
        <div><h2 id="globe-brief-title" className="text-base font-semibold">Tonight on Earth</h2><p className="text-xs text-muted">A briefing from this session's loaded feeds</p></div>
        <button ref={closeButton} type="button" aria-label="Close briefing" className={buttonClass} onClick={close}>Close</button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4">
        <p className="mb-4 text-xs text-muted">Fixed order: strongest quake (24 h), newest report (EONET 30 d / GVP 14 d), latest Kp (6 h), ISS, next scheduled launch. These are different units, not a shared severity ranking.</p>
        {offset !== 0 && <p className="mb-3 text-sm text-warn">Briefing uses the real clock. The globe is time travelling.</p>}
        <ol className="space-y-3">
          {result.cards.map(({ item, kind, selection }) => <li key={item.id} data-brief-card className="rounded-xl border border-line p-3">
            <p className="mb-1 text-xs font-mono uppercase tracking-wide text-accent">{kind} · {item.kind}</p>
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <p className="mt-1 break-words text-sm">{item.detail}</p>
            <p className="mt-2 break-words text-xs text-muted">{item.source}</p>
            <p className="mt-1 text-xs font-mono text-muted">{kind === "scheduled" ? "Scheduled" : kind === "computed" ? "Computed at" : "Observed / reported"} <time dateTime={new Date(item.whenMs).toISOString()}>{new Date(item.whenMs).toLocaleString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} UTC</time></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selection.focus && <button type="button" className={buttonClass} onClick={() => { const s = useGlobe.getState(); s.setView("orbit"); s.flyTo(selection.focus!); close(); }}>Fly to<span className="sr-only"> {item.title}</span></button>}
              <button type="button" className={buttonClass} onClick={() => { if (selection.id === "sat:25544" && issObject) void inspectBriefingSatellite(selection, issObject, new Date(nowMs)); else useGlobe.getState().select(selection); close(); }}>Inspect<span className="sr-only"> {item.title}</span></button>
            </div>
          </li>)}
        </ol>
        {result.unavailable.length > 0 && <div className="mt-4 border-t border-line pt-3"><h3 className="text-sm font-semibold">Not loaded</h3><ul className="mt-2 space-y-3 text-sm">{result.unavailable.map(row => <li key={row.source}><p>{row.source}</p><p className="text-xs text-muted">{row.reason}</p>{row.satellites && !layers.satellites && <button type="button" className={`${buttonClass} mt-2`} onClick={() => useGlobe.getState().toggleLayer("satellites")}>Turn on Satellites</button>}</li>)}</ul></div>}
      </div>
    </section>
  ) : null;
  const triggerButton = <button ref={trigger} type="button" data-brief-trigger aria-expanded={open} aria-controls={open ? "globe-briefing" : undefined} className={`pointer-events-auto glass-panel ${buttonClass}`} onClick={() => { if (open) close(); else { const box = trigger.current?.getBoundingClientRect(); const topbar = trigger.current?.closest("[data-globe-topbar]")?.getBoundingClientRect(); if (box) setTriggerBox({ right: box.right, bottom: topbar?.bottom ?? box.bottom }); setNowMs(Date.now()); if (phone) useGlobe.getState().setSheet("brief"); else setDesktopOpen(true); } }}>Tonight on Earth</button>;
  return <>{overflow ? createPortal(triggerButton, overflow) : triggerButton}{panel && createPortal(panel, document.querySelector("[data-globe-stage]") ?? document.body)}</>;
}
