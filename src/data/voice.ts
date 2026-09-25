// Hand-maintained (OD5: "Chip cadence: manual"). Transcribed from the-loopdown's
// voice/voice-profile.md "Measured 2026-09-02" block (raw.githubusercontent.com,
// main branch — the local checkout has uncommitted edits and is never read, M38).
// Re-measure with the-loopdown's scripts/voice-measure.py; update by hand, same as
// every other manual-cadence chip on this site.
export type VoiceMetric = {
  id: string;
  label: string;
  archive: number; // per 1k words, 2011-21 archive
  shipped: number; // per 1k words, the 2026 tech lessons
  rose: boolean; // the one signal measured evidence shows going UP
};

export const voiceMeasuredAt = "2026-09-02";

export const voiceMetrics: VoiceMetric[] = [
  { id: "contractions", label: "Contractions", archive: 23.19, shipped: 1.89, rose: false },
  { id: "first-person", label: "First person", archive: 20.23, shipped: 4.09, rose: false },
  { id: "questions", label: "Questions", archive: 8.70, shipped: 1.48, rose: false },
  { id: "direct-address", label: "Direct address", archive: 11.89, shipped: 14.48, rose: true },
  { id: "hedging", label: "Hedging", archive: 8.28, shipped: 2.53, rose: false },
];
