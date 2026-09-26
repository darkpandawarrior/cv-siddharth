import { voiceMeasuredAt, voiceMetrics } from "./data/voice";

/**
 * Before/after bars: the archive voice against the shipped lessons, per 1k
 * words. The point is systemic, not decorative: a mechanical style lint
 * (lint-voice.mjs) reported clean for a year while missing what actually
 * mattered. Four of five signals collapsed under it; only direct address
 * held (and rose). Self-measurement caught what the green build could not.
 */
export default function VoiceMeasured() {
  const maxValue = Math.max(...voiceMetrics.flatMap((m) => [m.archive, m.shipped]));

  return (
    <section aria-labelledby="voice-measured-heading" data-testid="voice-measured">
      <h3 id="voice-measured-heading">Voice, measured</h3>
      <p>
        A style lint stayed green for a year while checking the mechanical tier only, dashes and
        banned phrases. It never once looked at whether the writing actually sounded like him. Only
        counting the archive against what shipped caught the drift.
      </p>
      <ul data-testid="voice-metric-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {voiceMetrics.map((m) => (
          <li key={m.id} data-testid={`voice-metric-${m.id}`} data-rose={m.rose}>
            <span>{m.label}</span>
            {m.rose && <span data-testid={`voice-metric-${m.id}-rose-badge`}> rose</span>}
            <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Bar value={m.archive} max={maxValue} kind="archive" />
              <Bar value={m.shipped} max={maxValue} kind="shipped" />
            </div>
            <span>
              {m.archive.toFixed(2)} to {m.shipped.toFixed(2)} per 1k
            </span>
          </li>
        ))}
      </ul>
      <p>Measured {voiceMeasuredAt}. Re-runnable, not recalled.</p>
    </section>
  );
}

function Bar({ value, max, kind }: { value: number; max: number; kind: "archive" | "shipped" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <span
      data-testid={`voice-bar-${kind}`}
      style={{
        display: "block",
        height: 6,
        width: `${pct}%`,
        background: kind === "archive" ? "var(--accent2, #6b7280)" : "var(--accent, #22d3ee)",
        borderRadius: 3,
      }}
    />
  );
}
