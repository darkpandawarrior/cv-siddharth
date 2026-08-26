/**
 * THE CARRIER. The sound of the instrument the words arrive through.
 *
 * The Rendering doctrine says every description in this anthology reached the
 * reader through a translation rig and a Directory form, and that the rig may
 * HOLD, STRAIN, FAIL or REFUSE. The plates have carried that stamp since season
 * one. This is the same doctrine in the other channel.
 *
 * The voice speaks the words. This speaks the RIG: a carrier tone, a noise
 * floor, and a filter, generated in the browser with three oscillators and no
 * asset. It is not a mood bed and it is not ambience. It is the machine you are
 * being told not to trust, made audible, and it degrades across the four media
 * in the same direction the plates do.
 *
 * Free, offline, and nothing is published: Web Audio synthesises this on the
 * listener's own hardware, the same argument that lets the voice be the
 * listener's own synthesiser.
 */

export type RigState = "held" | "strained" | "failed";

export interface CarrierSpec {
  /** Base tone in Hz. Low is a warm channel, high is a thin one. */
  hz: number;
  /** Carrier level, 0..1. This sits UNDER speech and must never mask it. */
  level: number;
  /** Broadband noise level, 0..1. The floor of the channel. */
  noise: number;
  /** Low-pass cutoff in Hz. Lower is more muffled, more distant, more lost. */
  cutoff: number;
  /** Amplitude wobble in Hz. 0 is a steady channel. */
  drift: number;
  rig: RigState;
}

/**
 * Per season, and the direction is the season's own.
 *
 * S1 a relay that arrived. Clean carrier, open filter, held. This is the only
 *    one that is a real transmission.
 * S2 paper on a desk. There is no channel at all, so there is almost no
 *    carrier: what is left is room, not signal.
 * S3 the fire. The channel degrades with the burn ordinal, which is the same
 *    number the plate scorches with, so the page and the sound damage together.
 * S4 a public wall in a covered city. A hard, high, PA-thin channel with the
 *    tiling of a concourse behind it.
 */
export function carrierFor(season: number, kindling?: number): CarrierSpec {
  switch (season) {
    case 1:
      return { hz: 76, level: 0.05, noise: 0.012, cutoff: 5200, drift: 0.15, rig: "held" };
    case 2:
      // Never sent. A carrier here would be a channel that does not exist, so
      // this is a room tone and nothing else: no tone, only a whisper of floor.
      return { hz: 0, level: 0, noise: 0.008, cutoff: 3000, drift: 0, rig: "held" };
    case 3: {
      // 1..13 across the burn; 14 is the page he keeps and takes no damage.
      const burn = kindling && kindling < 14 ? kindling / 13 : 0;
      return {
        hz: 64,
        level: 0.05 + 0.03 * burn,
        noise: 0.014 + 0.05 * burn,
        cutoff: 4200 - 2400 * burn,
        drift: 0.3 + 1.9 * burn,
        rig: burn > 0.62 ? "failed" : burn > 0 ? "strained" : "held",
      };
    }
    case 4:
      return { hz: 112, level: 0.045, noise: 0.02, cutoff: 3400, drift: 0.1, rig: "held" };
    default:
      return { hz: 88, level: 0.035, noise: 0.01, cutoff: 4600, drift: 0.2, rig: "held" };
  }
}

/**
 * How the WORDS are shaped, so the thing reading is audibly not a person.
 *
 * The author asked for it to sound foreign and inhuman, and that is also the
 * safer answer: a warm human voice hands the correspondent an age, a sex and a
 * species, which is the void the whole work is built on. A voice that is
 * plainly an instrument hands you the instrument instead, which is what the
 * fiction says you have been listening through all along.
 *
 * Rate and pitch are pushed off their defaults deliberately. Slightly slow and
 * markedly low reads as machinery rather than as a friendly assistant, and the
 * damaged seasons go slower and lower still.
 */
export function voiceShape(season: number, kindling?: number): { rate: number; pitch: number } {
  const c = carrierFor(season, kindling);
  const damage = c.rig === "failed" ? 1 : c.rig === "strained" ? 0.5 : 0;
  return {
    // Never below 0.6: past that most engines start dropping phonemes, and an
    // unintelligible rig is not an atmospheric one, it is a broken feature.
    rate: Math.max(0.6, 0.86 - 0.12 * damage),
    pitch: Math.max(0.1, 0.62 - 0.18 * damage),
  };
}

/**
 * Prefer a voice that does not sound like a person reading a bedtime story.
 *
 * Browsers ship wildly different rosters, so this ranks rather than requires:
 * the compact/low-quality system voices are the most obviously synthetic and
 * are therefore the FIRST choice here, which is the opposite of what an app
 * normally wants. Falls through to whatever exists.
 */
export function pickRigVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  // Named robotic/novelty voices where a platform ships them, then any
  // non-local (network) voice, then anything.
  const wanted = /albert|zarvox|trinoids|whisper|bahh|bells|boing|cellos|deranged|hysterical|bad news|good news|organ|wobble|eddy|flo|grandma|jester|rocko|sandy|shelley|superstar/i;
  return pool.find((v) => wanted.test(v.name)) ?? pool.find((v) => !v.localService) ?? pool[0];
}

/**
 * The carrier, running. Returns a stop function.
 *
 * Deliberately tiny: two oscillators, one noise buffer, one filter, one gain.
 * Everything here is audible under speech at conversational volume and none of
 * it is loud enough to compete with the words, which was the constraint that
 * set every level above.
 */
export function startCarrier(spec: CarrierSpec): () => void {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = spec.cutoff;
  filter.connect(out);

  const nodes: { stop?: () => void }[] = [];

  if (spec.hz > 0) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = spec.hz;
    const g = ctx.createGain();
    g.gain.value = spec.level;
    osc.connect(g).connect(filter);
    osc.start();
    nodes.push({ stop: () => osc.stop() });

    // A second oscillator a few cents off makes the tone beat slowly against
    // itself, which is what stops it reading as a test tone.
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = spec.hz * 1.006;
    const g2 = ctx.createGain();
    g2.gain.value = spec.level * 0.6;
    osc2.connect(g2).connect(filter);
    osc2.start();
    nodes.push({ stop: () => osc2.stop() });

    if (spec.drift > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.drift;
      const depth = ctx.createGain();
      depth.gain.value = spec.level * 0.8;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      nodes.push({ stop: () => lfo.stop() });
    }
  }

  if (spec.noise > 0) {
    // Two seconds of noise, looped. Long enough that the loop point is not a
    // rhythm, short enough to be cheap.
    const frames = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = spec.noise;
    src.connect(ng).connect(filter);
    src.start();
    nodes.push({ stop: () => src.stop() });
  }

  // Fade in rather than click on. A channel opens, it does not appear.
  out.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.9);

  return () => {
    try {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      for (const n of nodes) n.stop?.();
      setTimeout(() => void ctx.close(), 600);
    } catch {
      /* a context torn down twice is not an error worth surfacing */
    }
  };
}
