/**
 * The world's sound, synthesised — no audio files anywhere.
 *
 * Every sound here is generated with oscillators and filtered noise at runtime,
 * which is a deliberate choice rather than a limitation dressed up as one: a
 * handful of .mp3s would be a few hundred kB on a route that already ships an
 * 816 kB physics engine, and the engine note has to track speed continuously
 * anyway, which a sample cannot do without pitch-shifting artefacts.
 *
 * THREE RULES, all of them about not being annoying:
 *
 * 1. NOTHING STARTS UNTIL A GESTURE. Browsers suspend AudioContext until a real
 *    user interaction, and a portfolio that autoplays engine noise at a
 *    recruiter is worse than a silent one. The context is created lazily on the
 *    first keypress or tap inside the world.
 * 2. NOTHING BLOCKS. Construction is synchronous and cheap, failures are
 *    swallowed, and the world neither waits for audio nor cares if it never
 *    arrives. On a browser with no Web Audio at all, every call here is a no-op.
 * 3. IT CAN BE TURNED OFF, and stays off. The preference is persisted, and mute
 *    is checked at the graph's output rather than at each call site, so a muted
 *    world costs one gain node rather than a branch in every frame.
 */

const MUTE_KEY = "playground:muted";

type Engine = {
  ctx: AudioContext;
  master: GainNode;
  /** Engine tone: two detuned saws through a lowpass, gain and pitch by speed. */
  engineGain: GainNode;
  engineFilter: BiquadFilterNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  /** Shared noise buffer for impacts, splashes and wind. */
  noise: AudioBuffer;
};

let engine: Engine | null = null;
let muted = readMuted();
let failed = false;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** One second of white noise, reused by every percussive sound. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Builds the audio graph. Called on the first gesture, never before, and never
 * throws — if anything here is unavailable the whole module goes quiet for the
 * session rather than taking the world down with it.
 */
export function initAudio(): void {
  if (engine || failed) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      failed = true;
      return;
    }
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Engine: two saws a few cents apart give the beating that makes a single
    // oscillator sound like a toy buzzer instead of a motor.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 700;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "sawtooth";
    oscA.frequency.value = 60;
    oscB.frequency.value = 60;
    oscB.detune.value = 12;
    oscA.connect(engineFilter);
    oscB.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    oscA.start();
    oscB.start();

    engine = { ctx, master, engineGain, engineFilter, oscA, oscB, noise: makeNoise(ctx) };
    void ctx.resume();
  } catch {
    failed = true;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMuted(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* preference just won't persist */
  }
  if (engine) engine.master.gain.value = muted ? 0 : 0.5;
  return muted;
}

/**
 * Engine note, called every frame.
 *
 * Pitch and volume both follow speed, and both are ramped rather than assigned:
 * a bare `.value =` at 60fps produces zipper noise, because each step is a
 * discontinuity in the waveform. setTargetAtTime smooths it in the audio thread
 * where it belongs.
 */
export function updateEngine(speed: number, airborne: boolean): void {
  if (!engine || muted) return;
  const s = Math.min(1, Math.abs(speed) / 22);
  const now = engine.ctx.currentTime;
  // Airborne: the note thins out rather than cutting, so a jump reads as the
  // engine unloading instead of the sound dropping out.
  const level = airborne ? 0.03 : 0.05 + s * 0.1;
  engine.engineGain.gain.setTargetAtTime(level, now, 0.08);
  const hz = 55 + s * 150;
  engine.oscA.frequency.setTargetAtTime(hz, now, 0.06);
  engine.oscB.frequency.setTargetAtTime(hz, now, 0.06);
  engine.engineFilter.frequency.setTargetAtTime(500 + s * 1800, now, 0.1);
}

/** A filtered noise burst — the shape behind impacts, splashes and boost. */
function burst(opts: {
  duration: number;
  gain: number;
  type: BiquadFilterType;
  from: number;
  to: number;
}): void {
  if (!engine || muted) return;
  const { ctx, master, noise } = engine;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  filter.frequency.setValueAtTime(opts.from, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), now + opts.duration);
  g.gain.setValueAtTime(opts.gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + opts.duration + 0.05);
}

/** Hitting something solid. `force` 0..1 scales it. */
export function playImpact(force: number): void {
  burst({ duration: 0.16, gain: 0.08 + force * 0.22, type: "lowpass", from: 1400, to: 120 });
}

/** Boost ignition — a short rising hiss under the engine. */
export function playBoost(): void {
  burst({ duration: 0.35, gain: 0.16, type: "highpass", from: 300, to: 2600 });
}

/** Collecting an artifact: a clean two-note chime, the only tuned sound here. */
export function playPickup(): void {
  if (!engine || muted) return;
  const { ctx, master } = engine;
  const now = ctx.currentTime;
  [880, 1320].forEach((hz, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, now + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35);
    osc.connect(g);
    g.connect(master);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.4);
  });
}

/**
 * A patch of the city resolving out of the dust — a soft, short ping.
 *
 * Deliberately the quietest and shortest tuned sound in this file: World.tsx
 * calls this every time `telemetry.resolvedFraction` climbs (throttled there
 * to a few times a second at most), which is far more often than a pickup or
 * a boost ignition, so it has to disappear into the ambience rather than
 * announce itself the way playPickup's two-note chime does.
 */
export function playResolveChime(): void {
  if (!engine || muted) return;
  const { ctx, master } = engine;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(1900, now + 0.08);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + 0.16);
}

/** Releases the context. The world must not leave an audio graph running after
 *  the visitor has navigated into a room. */
export function disposeAudio(): void {
  if (!engine) return;
  try {
    engine.oscA.stop();
    engine.oscB.stop();
    void engine.ctx.close();
  } catch {
    /* already gone */
  }
  engine = null;
}
