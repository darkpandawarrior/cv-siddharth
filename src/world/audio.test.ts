import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const param = (value = 0) => ({ value, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });

type FakeGain = ReturnType<typeof node> & { gain: ReturnType<typeof param> };
type FakeSource = ReturnType<typeof node> & { buffer: unknown; loop: boolean };
type FakeFilter = ReturnType<typeof node> & { type: string; frequency: ReturnType<typeof param>; Q: ReturnType<typeof param> };
type FakeOscillator = ReturnType<typeof node> & { type: string; frequency: ReturnType<typeof param>; detune: ReturnType<typeof param>; onended: (() => void) | null };

class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 0;
  sampleRate = 8;
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  filters: FakeFilter[] = [];
  oscillators: FakeOscillator[] = [];
  listener = Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map((name) => [name, param()]));
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  constructor() { FakeContext.instances.push(this); }
  createGain(): FakeGain { const value = { ...node(), gain: param() }; this.gains.push(value); return value; }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  createBufferSource(): FakeSource { const value = { ...node(), buffer: null, loop: false }; this.sources.push(value); return value; }
  createBiquadFilter(): FakeFilter { const value = { ...node(), type: "lowpass", frequency: param(), Q: param() }; this.filters.push(value); return value; }
  createOscillator(): FakeOscillator { const value = { ...node(), type: "sine", frequency: param(), detune: param(), onended: null }; this.oscillators.push(value); return value; }
  createPanner() { return { ...node(), positionX: param(), positionY: param(), positionZ: param(), panningModel: "equalpower", refDistance: 1 }; }
}

const ambient = {
  dischargeM3s: 15, range7d: [10, 20] as const,
  rainMmH: 2.4, rain6hMm: 14.6, windKmh: 14,
  daypart: "day" as const, tier: 2 as const, waterPosition: [0, 0, 0] as const,
};

beforeEach(() => {
  vi.resetModules();
  FakeContext.instances = [];
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  vi.stubGlobal("window", { AudioContext: FakeContext });
});
afterEach(() => vi.unstubAllGlobals());

describe("world audio rules", () => {
  it("cannot create or resume a context through ambient updates before initAudio", async () => {
    const audio = await import("./audio.ts");
    audio.setRain(2.4);
    audio.setAmbient(ambient);
    audio.setAudioListener([1, 2, 3], [0, 0, -1], [0, 1, 0]);
    audio.playImpact(1);
    expect(FakeContext.instances).toHaveLength(0);
    audio.initAudio();
    audio.initAudio();
    expect(FakeContext.instances).toHaveLength(1);
    expect(FakeContext.instances[0].resume).toHaveBeenCalledOnce();
  });

  it("shares one noise buffer, smooths the beds, and keeps dry rain silent", async () => {
    const audio = await import("./audio.ts");
    audio.initAudio();
    audio.setAmbient(ambient);
    const ctx = FakeContext.instances[0];
    expect(ctx.sources).toHaveLength(3);
    expect(new Set(ctx.sources.map((source) => source.buffer)).size).toBe(1);
    expect(ctx.sources.every((source) => source.loop)).toBe(true);
    expect(ctx.gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.0192, 0, 0.4);
    expect(ctx.gains[3].gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.014, 12), 0, 0.5);
    expect(ctx.gains[4].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.0625, 0, 0.5);
    expect(ctx.filters[1].frequency.setTargetAtTime).toHaveBeenLastCalledWith(2384, 0, 0.5);
    audio.setRain(0);
    audio.setRain(NaN);
    expect(ctx.gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.4);
    expect(ctx.sources).toHaveLength(3);
  });

  it("persists mute and applies it to the output after reloading the module", async () => {
    let audio = await import("./audio.ts");
    expect(audio.toggleMuted()).toBe(true);
    expect(localStorage.getItem("playground:muted")).toBe("1");
    vi.resetModules();
    audio = await import("./audio.ts");
    expect(audio.isMuted()).toBe(true);
    audio.initAudio();
    const ctx = FakeContext.instances[0];
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(audio.toggleMuted()).toBe(false);
    expect(ctx.gains[0].gain.value).toBe(0.5);
    audio.disposeAudio();
    expect(ctx.close).toHaveBeenCalledOnce();
    audio.setAmbient(ambient);
    expect(ctx.sources).toHaveLength(0);
  });

  it("survives denied storage, absent audio and rejected resume", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } });
    const audio = await import("./audio.ts");
    expect(audio.isMuted()).toBe(false);
    expect(() => audio.toggleMuted()).not.toThrow();
    vi.stubGlobal("window", {});
    expect(() => audio.initAudio()).not.toThrow();
    vi.resetModules();
    vi.stubGlobal("window", { AudioContext: class extends FakeContext { resume = vi.fn(() => Promise.reject(Error("suspended"))); } });
    const retry = await import("./audio.ts");
    retry.initAudio();
    await Promise.resolve();
  });

  it("samples listener pose at most ten times per second", async () => {
    const audio = await import("./audio.ts");
    audio.initAudio();
    const ctx = FakeContext.instances[0];
    audio.setAudioListener([1, 2, 3], [0, 0, -1], [0, 1, 0]);
    ctx.currentTime = 0.05;
    audio.setAudioListener([4, 5, 6], [0, 0, -1], [0, 1, 0]);
    expect(ctx.listener.positionX.setTargetAtTime).toHaveBeenCalledOnce();
    ctx.currentTime = 0.1;
    audio.setAudioListener([4, 5, 6], [0, 0, -1], [0, 1, 0]);
    expect(ctx.listener.positionX.setTargetAtTime).toHaveBeenLastCalledWith(4, 0.1, 0.05);
  });

  it("uses fewer daypart voices on tier 2 and no chorus or bells on tier 3", async () => {
    const audio = await import("./audio.ts");
    audio.initAudio();
    const ctx = FakeContext.instances[0];
    audio.setAmbient({ ...ambient, daypart: "dawn" });
    expect(ctx.oscillators).toHaveLength(3);
    audio.setAmbient({ ...ambient, daypart: "dawn" });
    expect(ctx.oscillators).toHaveLength(3);
    ctx.currentTime = 8;
    audio.setAmbient({ ...ambient, daypart: "dawn", tier: 1 });
    expect(ctx.oscillators).toHaveLength(6);
    audio.setAmbient({ ...ambient, daypart: "dusk", tier: 3 });
    expect(ctx.oscillators).toHaveLength(6);
    audio.setAmbient({ ...ambient, daypart: "dusk" });
    expect(ctx.oscillators).toHaveLength(7);
    expect(ctx.oscillators[6].frequency.setValueAtTime).toHaveBeenCalledWith(440, 8);
    audio.toggleMuted();
    ctx.currentTime = 40;
    audio.setAmbient({ ...ambient, daypart: "dawn" });
    expect(ctx.oscillators).toHaveLength(7);
  });
});
