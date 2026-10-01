import { feedEmptyState, GROUP_OF, GROUP_LABEL, GROUPS, type FeedGroup } from "./feedEmptyState.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFeedStore, formatRelative, bucketLabel, minuteBucket, type FeedItem } from "../feed.ts";
import { useGlobe, type Selection } from "../globeStore.ts";

/** WAVE 6 LANE X1 (live world feed rail). LayerPanel renders this as its
 *  "Live" tab, sm+ column and phone bottom sheet alike — the store this
 *  reads (`useFeedStore`) is filled by publisher hooks in HazardLayer,
 *  PulseLayer, SatelliteLayer, ArcLayer and TogetherLayer, never by this
 *  file itself. */

const SEVERITY_COLOR: Record<FeedItem["severity"], string> = {
  info: "var(--color-probe)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
};

/** One small stroke-only SVG per group — no emoji (house rule), 16x16,
 *  currentColor so the severity dot's own colour paints it. Kept as plain
 *  path data rather than a lucide-react import: this file already imports
 *  nothing else from that package, and four fixed glyphs are cheaper than a
 *  new dependency of their icon set for a tab most visitors never open. */
function GroupIcon({ group }: { group: FeedGroup }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (group) {
    case "hazard":
      return (
        <svg {...common}>
          <path d="M12 3 2 20h20L12 3Z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "signal":
      return (
        <svg {...common}>
          <path d="M2 12h4l2 7 4-14 2 7h8" />
        </svg>
      );
    case "satellite":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="6" height="6" rx="1" />
          <path d="m14.5 9.5 3.5-3.5M9.5 14.5 6 18M17 3l4 4-2 2-4-4 2-2ZM3 17l4 4 2-2-4-4-2 2Z" />
        </svg>
      );
    case "explorer":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
        </svg>
      );
  }
}

/** A feed item's focus is optional (a Kp jump has no single point) — this
 *  only builds a Selection when there is one, otherwise the row still
 *  selects (the inspector card fills in) but has no "Fly to" affordance. */
function selectionFor(item: FeedItem, nowMs: number): Selection {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    rows: [
      { label: "detail", value: item.detail },
      { label: "when", value: formatRelative(item.whenMs, nowMs) },
    ],
    source: item.source,
    live: item.live,
    focus: item.focus,
  };
}

function FeedRow({ item, nowMs, onPick }: { item: FeedItem; nowMs: number; onPick: (item: FeedItem) => void }) {
  const group = GROUP_OF[item.kind];
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        className="flex min-h-11 w-full items-start gap-2 rounded px-1 py-1.5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span aria-hidden className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLOR[item.severity] }}>
          <GroupIcon group={group} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-zinc-200">{item.title}</span>
          <span className="block break-words text-sm text-muted">{item.detail}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs font-mono text-zinc-400">{formatRelative(item.whenMs, nowMs)}</span>
      </button>
    </li>
  );
}

export default function FeedRail(_props: { tier: 1 | 2 | 3 }) {
  const items = useFeedStore((s) => s.items);
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const toggleLayer = useGlobe((s) => s.toggleLayer);
  const timeOffsetMin = useGlobe((s) => s.timeOffsetMin);
  const select = useGlobe((s) => s.select);
  const flyTo = useGlobe((s) => s.flyTo);
  const [group, setGroup] = useState<FeedGroup | null>(null);
  // Relative times tick without a re-publish — a plain 5s clock is cheap
  // enough for a list this small (cap 200, usually far fewer visible) and
  // matches the "relative times that tick" brief without a per-item timer.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const paused = timeOffsetMin !== 0;
  const empty = feedEmptyState(items, group, layers, status);
  const filtered = useMemo(() => (group ? items.filter((i) => GROUP_OF[i.kind] === group) : items), [items, group]);

  function onPick(item: FeedItem) {
    if (item.focus) flyTo(item.focus);
    select(selectionFor(item, nowMs));
  }

  // sr-only aria-live announcer: at most one item every 10s, so a busy feed
  // never turns into a wall of screen-reader chatter (brief's own cap).
  const [announced, setAnnounced] = useState("");
  const lastAnnouncedIdRef = useRef<string | null>(null);
  const lastAnnouncedAtRef = useRef(0);
  useEffect(() => {
    const newest = items[0];
    if (!newest || newest.id === lastAnnouncedIdRef.current) return;
    const now = Date.now();
    if (now - lastAnnouncedAtRef.current < 10_000) return;
    lastAnnouncedIdRef.current = newest.id;
    lastAnnouncedAtRef.current = now;
    setAnnounced(`${newest.title}. ${newest.detail}`);
  }, [items]);

  return (
    <div data-globe-feed-rail>
      <div className="sr-only" aria-live="polite">
        {announced}
      </div>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Filter the live feed">
        <button
          type="button"
          onClick={() => setGroup(null)}
          aria-pressed={group === null}
          className={`min-h-11 min-w-11 rounded-full border border-line px-2 py-0.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${group === null ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          All
        </button>
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            aria-pressed={group === g}
            className={`min-h-11 min-w-11 rounded-full border border-line px-2 py-0.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${group === g ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {GROUP_LABEL[g]}
          </button>
        ))}
      </div>

      {paused ? (
        <p data-feed-paused className="px-1 py-3 text-sm text-zinc-400">
          Paused while you scrub. Feed resumes at the live instant.
        </p>
      ) : filtered.length === 0 ? (
        <div data-feed-empty className="px-1 py-3 text-sm text-muted">
          <p className="break-words">{empty.text}</p>
          {empty.action && <button type="button" className="mt-2 min-h-11 min-w-11 rounded border border-line px-3 text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => {
            if (empty.action === "all") setGroup(null);
            else for (const id of empty.layers) if (!layers[id]) toggleLayer(id);
          }}>{empty.action === "all" ? "Show all" : "Turn on layers"}</button>}
        </div>
      ) : (
        <ul data-feed-list className="space-y-0.5">
          {filtered.map((item, i) => {
            const prev = filtered[i - 1];
            const newGroup = !prev || minuteBucket(prev.whenMs) !== minuteBucket(item.whenMs);
            return (
              <FeedGroupBoundary key={item.id} showHeader={newGroup} whenMs={item.whenMs} nowMs={nowMs}>
                <FeedRow item={item} nowMs={nowMs} onPick={onPick} />
              </FeedGroupBoundary>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A minute-group header rendered as a sibling `<li>` right before the first
 *  row of that minute — kept as a tiny wrapper rather than a nested `<ul>`
 *  per group, so the list stays one flat `role="list"` (screen readers read
 *  a flat list far more predictably than repeated nested lists). */
function FeedGroupBoundary({ showHeader, whenMs, nowMs, children }: { showHeader: boolean; whenMs: number; nowMs: number; children: React.ReactNode }) {
  return (
    <>
      {showHeader && (
        <li aria-hidden className="px-1 pb-0.5 pt-2 text-xs font-mono text-zinc-400 first:pt-0">
          {bucketLabel(whenMs, nowMs)}
        </li>
      )}
      {children}
    </>
  );
}
