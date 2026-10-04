/**
 * The world's sound, synthesised with no audio files anywhere.
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
  ambient?: {
    rain: GainNode;
    rainFilter: BiquadFilterNode;
    wind: GainNode;
    water: GainNode;
    waterPanner: PannerNode;
  };
  lastListener?: number;
  nextCue?: number;
  daypart?: AmbientState["daypart"];
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
 * throws. If anything here is unavailable the whole module goes quiet for the
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
    void ctx.resume().catch(() => { /* audio stays silent */ });
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

/** A filtered noise burst, the shape behind impacts, splashes and boost. */
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

/** Boost ignition, a short rising hiss under the engine. */
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
 * A patch of the city resolving out of the dust, a soft, short ping.
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
    void engine.ctx.close().catch(() => { /* already gone */ });
  } catch {
    /* already gone */
  }
  engine = null;
}


export type AudioPoint = readonly [number, number, number];
export type AmbientState = {
  dischargeM3s: number | null;
  range7d: readonly [number, number] | null;
  windKmh: number | null;
  rainMmH: number | null;
  rain6hMm: number | null;
  daypart: "night" | "dawn" | "day" | "dusk";
  tier: 1 | 2 | 3;
  waterPosition: AudioPoint;
};

/** Quiet at the 7-day minimum, three times louder at its maximum.
 * Missing or invalid measurements stay silent; a flat range uses the floor. */
export function waterBedGain(dischargeM3s: number | null, range7d: readonly [number, number] | null): number {
  if (dischargeM3s == null || !range7d) return 0;
  const [min, max] = range7d;
  if (![dischargeM3s, min, max].every(Number.isFinite) || dischargeM3s < 0 || min < 0 || max < min) return 0;
  const normalised = max === min ? 0 : Math.max(0, Math.min(1, (dischargeM3s - min) / (max - min)));
  return 0.025 + 0.075 * normalised;
}

function positive(value: number | null): number {
  return value != null && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function position(panner: PannerNode, point: AudioPoint): void {
  if (panner.positionX) {
    panner.positionX.value = point[0];
    panner.positionY.value = point[1];
    panner.positionZ.value = point[2];
  } else panner.setPosition(...point);
}

/** Three loop sources share the same buffer. Only a gesture can build them. */
function ambientGraph(e: Engine): NonNullable<Engine["ambient"]> {
  if (e.ambient) return e.ambient;
  const loop = (type: BiquadFilterType, hz: number, spatial = false) => {
    const source = e.ctx.createBufferSource();
    source.buffer = e.noise;
    source.loop = true;
    const filter = e.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = 0.5;
    const gain = e.ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    const panner = spatial ? e.ctx.createPanner() : null;
    if (panner) {
      panner.panningModel = "equalpower";
      panner.refDistance = 30;
      gain.connect(panner);
      panner.connect(e.master);
    } else gain.connect(e.master);
    source.start();
    return { gain, filter, panner };
  };
  const rain = loop("bandpass", 2200);
  const wind = loop("lowpass", 350);
  const water = loop("lowpass", 900, true);
  e.ambient = { rain: rain.gain, rainFilter: rain.filter, wind: wind.gain, water: water.gain, waterPanner: water.panner! };
  return e.ambient;
}

/** Hourly rain controls the band-passed noise level, including a silent dry sky. */
export function setRain(mmPerHour: number): void {
  if (!engine) return;
  try {
    ambientGraph(engine).rain.gain.setTargetAtTime(Math.min(1, positive(mmPerHour) / 10) * 0.08, engine.ctx.currentTime, 0.4);
  } catch { /* unsupported audio must not stop the world */ }
}

function ambientCue(e: Engine, state: AmbientState): void {
  const now = e.ctx.currentTime;
  if (e.daypart !== state.daypart) {
    e.daypart = state.daypart;
    e.nextCue = now;
  }
  if (muted || state.tier === 3 || (state.daypart !== "dawn" && state.daypart !== "dusk") || now < (e.nextCue ?? 0)) return;
  const dawn = state.daypart === "dawn";
  e.nextCue = now + (dawn ? 8 : 24);
  const panner = e.ctx.createPanner();
  panner.panningModel = "equalpower";
  panner.refDistance = 60;
  position(panner, dawn ? [state.waterPosition[0] + 12, 8, state.waterPosition[2]] : [30, 6, 0]);
  panner.connect(e.master);
  const voices = state.tier === 1 ? 3 : 1;
  let remaining = voices;
  for (let i = 0; i < voices; i++) {
    const osc = e.ctx.createOscillator();
    const gain = e.ctx.createGain();
    const start = now + i * (dawn ? 0.22 : 0.06);
    const duration = dawn ? 0.18 : 2.5;
    osc.type = "sine";
    osc.frequency.setValueAtTime(dawn ? 1800 + i * 400 : 440 * (1 + i * 0.5), start);
    if (dawn) osc.frequency.exponentialRampToValueAtTime(3200 + i * 300, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(dawn ? 0.025 : 0.035 / (i + 1), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(panner);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      if (--remaining === 0) panner.disconnect();
    };
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

/** Live S6 sets water level; S4 changes the rain's texture, never a CI tone. */
export function setAmbient(state: AmbientState): void {
  if (!engine) return;
  try {
    const graph = ambientGraph(engine);
    const now = engine.ctx.currentTime;
    graph.water.gain.setTargetAtTime(waterBedGain(state.dischargeM3s, state.range7d), now, 0.5);
    graph.wind.gain.setTargetAtTime(Math.min(1, positive(state.windKmh) / 40) * 0.04, now, 0.5);
    position(graph.waterPanner, state.waterPosition);
    setRain(state.rainMmH ?? 0);
    graph.rainFilter.frequency.setTargetAtTime(1800 + Math.min(30, positive(state.rain6hMm)) * 40, now, 0.5);
    ambientCue(engine, state);
  } catch { /* unsupported audio must not stop the world */ }
}

/** Camera pose at most 10 Hz. Legacy Web Audio listeners use the same cadence. */
export function setAudioListener(point: AudioPoint, forward: AudioPoint, up: AudioPoint): void {
  if (!engine) return;
  const now = engine.ctx.currentTime;
  if (engine.lastListener != null && now - engine.lastListener < 0.1) return;
  engine.lastListener = now;
  try {
    const listener = engine.ctx.listener;
    if (listener.positionX) {
      [listener.positionX, listener.positionY, listener.positionZ,
        listener.forwardX, listener.forwardY, listener.forwardZ,
        listener.upX, listener.upY, listener.upZ].forEach((param, i) => {
        param.setTargetAtTime([...point, ...forward, ...up][i], now, 0.05);
      });
    } else {
      listener.setPosition(...point);
      listener.setOrientation(...forward, ...up);
    }
  } catch { /* unsupported listener stays at its default pose */ }
}
