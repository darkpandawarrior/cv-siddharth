// WAVE 6 LANE X6 (opt-in sound). WebAudio-synthesized cues only — no audio
// files, per the brief. One shared AudioContext + master gain, created
// lazily on the toggle's own click (a real user gesture; every browser
// blocks audio before one). Each play* function wires a short-lived
// oscillator or noise burst straight to the master gain and disconnects
// itself on `onended` — a handful of cues a minute never needs a node pool.
// ponytail: no unit test here — this is the impure "make a sound" glue
// (same as HexbinLayer.tsx's own instancing has none); the decision logic
// this glue is driven by lives in soundTriggers.ts and IS tested there.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// ponytail: one fixed master level, add a user-facing slider if the field
// ever asks for one — the brief's own UI for this is "a small icon button".
const MASTER_VOLUME = 0.35;

/** Lazily creates (or resumes) the shared context. Called by every play*
 *  function, and once eagerly from the toggle's own onClick so the very
 *  first cue after enabling isn't silently dropped by browser autoplay. */
function getContext(): { c: AudioContext; g: GainNode } | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return { c: ctx, g: master };
}

export function primeAudio(): void {
  getContext();
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A simple attack/decay envelope on `gain`, starting now. */
function envelope(c: AudioContext, gain: GainNode, peak: number, attack: number, release: number): void {
  const now = c.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

/** Low rumble — an M>=5 quake. One continuous low sine, not a musical note:
 *  magnitude has no pitch, so a bigger quake reads as louder and a touch
 *  longer, never higher. */
export function playRumble(magnitude: number): void {
  const audio = getContext();
  if (!audio) return;
  const { c, g } = audio;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 46;
  const strength = Math.min(1, Math.max(0, (magnitude - 5) / 4));
  osc.connect(gain);
  gain.connect(g);
  envelope(c, gain, 0.55 + strength * 0.3, 0.06, 1.1 + strength * 0.6);
  osc.start();
  osc.stop(c.currentTime + 2);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Chime — a CI run passed. Two quick ascending sine notes. */
export function playChime(): void {
  const audio = getContext();
  if (!audio) return;
  const { c, g } = audio;
  for (const [i, freq] of [880, 1318.5].entries()) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(g);
    const start = c.currentTime + i * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.45, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.start(start);
    osc.stop(start + 0.32);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

/** Muted thud — a CI run failed. A short, deliberately dull low-passed
 *  noise burst (quiet and flat, not alarming — a failure notice, not a
 *  siren). */
export function playThud(): void {
  const audio = getContext();
  if (!audio) return;
  const { c, g } = audio;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.18);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 180;
  const gain = c.createGain();
  src.connect(filter);
  filter.connect(gain);
  gain.connect(g);
  envelope(c, gain, 0.3, 0.005, 0.16);
  src.start();
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/** Whoosh — the camera flying to a new focus. A band-pass-filtered noise
 *  burst with the filter sweeping down, the standard synthesized "air
 *  moving past" cue. */
export function playWhoosh(): void {
  const audio = getContext();
  if (!audio) return;
  const { c, g } = audio;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.35);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(2200, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.32);
  const gain = c.createGain();
  src.connect(filter);
  filter.connect(gain);
  gain.connect(g);
  envelope(c, gain, 0.25, 0.02, 0.3);
  src.start();
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}
