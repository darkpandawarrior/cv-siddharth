/**
 * THE RENDERING. Reading the anthology aloud, on the reader's own instrument.
 *
 * A council refused a published audiobook and it was right to. The
 * correspondent has no body: he is never described, never given a species,
 * never named as anything, and Season Three burns the only description of him
 * that ever existed. A published voice hands that void an age, a sex, a species
 * and an accent, and author-published audio is canonisation by other means, the
 * same class of mistake as adopting a fan name for the fourteenth.
 *
 * But the same ruling handed over the design in one line:
 *
 *     nothing may read this corpus aloud that does not exist inside it.
 *
 * Web Speech API satisfies that exactly, and it is the reason this file uses no
 * API, no key and no vendor. NOTHING IS PUBLISHED. The reader's own machine
 * renders the text with whatever voice that machine happens to have, which is
 * precisely the Rendering doctrine the fiction already runs on: everything in
 * this anthology reached the reader through an instrument that may hold,
 * strain, fail, or refuse. A synthetic voice on a stranger's laptop is one more
 * rig, and the work has been telling you not to trust the rig since entry one.
 *
 * WHAT THIS IS NOT. It is not the accessibility path. The prose is real text in
 * a real <article> and a screen reader has always read all of it; nothing here
 * gates content. This is an instrument laid on top, and seasonRendering() below
 * is allowed to refuse it for reasons internal to the fiction precisely BECAUSE
 * refusing it withholds nothing a reader cannot otherwise get.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { carrierFor, pickRigVoice, startCarrier, voiceShape, type RigState } from "./carrier.ts";

const hasSynthesis = () => typeof window !== "undefined" && "speechSynthesis" in window;
const neverChanges = () => () => {};
const unsupportedOnServer = () => false;

/** How a season may be rendered aloud, and what the control says about it. */
export interface RenderingMode {
  /** Whether the instrument is offered at all. */
  offered: boolean;
  /** The control's own label. Institutional register, like every other stamp. */
  label: string;
  /** One line under it. This is fiction, not a tooltip: it says what the reader
   *  is about to hear and, where relevant, why it is not what they think. */
  note: string;
}

/**
 * Per season, because the four media were never interchangeable and an audio
 * layer that ignores that is a fifth medium nobody designed.
 *
 * S1 was BROADCAST. It went out through a rig and arrived. Playing it is the
 *    only case where the audio is the thing that actually happened.
 * S2 was NEVER SENT. Ninety-one pages into a wooden case, transmitted to
 *    nobody, so nothing in this universe has ever heard a word of it. The
 *    instrument still runs, and the note says exactly whose voice it is.
 * S3 IS ASH. Thirteen of the fourteen pages no longer exist, and a performance
 *    of a burned page un-burns it. Refused, and the refusal is the content.
 *    Piece fourteen is the one page he keeps, so it still exists to be read.
 * S4 is a CITY THAT TALKS. Gates announce, panels recite the licensed courtesy,
 *    machines execute the statutory blocks. Those parts are in-world audio.
 */
export function seasonRendering(season: number, kindling?: number): RenderingMode {
  switch (season) {
    case 1:
      return {
        offered: true,
        label: "PLAY RELAY",
        note: "Filed through a rig and received. This is the only season where hearing it is what happened.",
      };
    case 2:
      return {
        offered: true,
        label: "READ ALOUD",
        note: "Never sent. Nothing in this universe has ever heard this page, so the voice is your machine's, not his.",
      };
    case 3:
      // The kept page is piece fourteen and carries no withdrawal.
      return kindling === 14
        ? { offered: true, label: "READ ALOUD", note: "The one page he keeps. It still exists, so it can still be read." }
        : {
            offered: false,
            label: "WITHDRAWN",
            note: "This page was burned. Reading it aloud would put it back, so nothing here will.",
          };
    case 4:
      return {
        offered: true,
        label: "PLAY NOTICE",
        note: "The city recites its own paperwork at every gate. The prose between is your machine reading a wall.",
      };
    default:
      return { offered: true, label: "READ ALOUD", note: "Rendered by your own instrument, like everything else here." };
  }
}

export interface Rendering {
  supported: boolean;
  playing: boolean;
  paused: boolean;
  /** What the instrument is doing to the signal, in the plates' own vocabulary. */
  rig: RigState;
  /** 0..1 across the whole piece, by chunk. Enough for a progress rule. */
  progress: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/**
 * Speak a long text in order, in pieces, with real pause and resume.
 *
 * Chunked rather than one utterance for two measured reasons. Browsers cap a
 * single utterance (Chrome cuts around fifteen seconds of speech and simply
 * stops, with no error), and a single utterance has no seekable interior, so
 * pause/resume and progress both become impossible. Splitting on sentences
 * gives both, and the chunk boundary is also the only place a pause can land
 * without cutting a word in half.
 */
export function useRendering(text: string, season = 0, kindling?: number): Rendering {
  const supported = useSyncExternalStore(neverChanges, hasSynthesis, unsupportedOnServer);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const chunksRef = useRef<string[]>([]);
  const carrierRef = useRef<(() => void) | null>(null);
  // Guards the teardown: cancel() on a synth that has never spoken is the call
  // that wakes the platform engine, which measurably costs seconds on a cold
  // machine. Nothing to cancel until something has started.
  const startedRef = useRef(false);
  const spec = carrierFor(season, kindling);

  const stop = useCallback(() => {
    if (startedRef.current && hasSynthesis()) window.speechSynthesis.cancel();
    // The channel closes with the voice. A carrier still running under silence
    // is the one thing here that would read as a bug rather than as a rig.
    carrierRef.current?.();
    carrierRef.current = null;
    setPlaying(false);
    setPaused(false);
    setIndex(0);
  }, []);

  // Speech synthesis outlives the component and, in some browsers, the page.
  // Leaving mid-sentence must not leave a voice running in a closed tab.
  useEffect(() => stop, [stop]);
  // A new piece is a new recording. Without this, navigating between entries
  // keeps reading the previous one, which is the exact failure the damage
  // register is about.
  useEffect(() => stop, [text, stop]);

  const start = useCallback(() => {
    if (!hasSynthesis()) return;
    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return;
    chunksRef.current = chunks;
    startedRef.current = true;
    window.speechSynthesis.cancel();
    setIndex(0);
    setPlaying(true);
    setPaused(false);

    // The channel opens before the first word and closes after the last, so the
    // reading arrives THROUGH something rather than starting in a vacuum.
    carrierRef.current?.();
    carrierRef.current = startCarrier(spec);

    // getVoices() is empty until the engine has enumerated, which on a cold
    // machine happens after first call. Whatever is there at start is what we
    // get; a missing roster falls through to the platform default, shaped.
    const voice = pickRigVoice(window.speechSynthesis.getVoices());
    const shape = voiceShape(season, kindling);

    let i = 0;
    const speakNext = () => {
      if (i >= chunks.length) {
        carrierRef.current?.();
        carrierRef.current = null;
        setPlaying(false);
        setIndex(0);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.lang = document.documentElement.lang || "en-US";
      if (voice) u.voice = voice;
      u.rate = shape.rate;
      u.pitch = shape.pitch;
      u.onend = () => {
        i += 1;
        setIndex(i);
        speakNext();
      };
      // A failed chunk must not silently end the reading: skip it and continue,
      // the same way the rig strains on one word and carries on with the line.
      u.onerror = () => {
        i += 1;
        setIndex(i);
        speakNext();
      };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  }, [text, season, kindling, spec]);

  const pause = useCallback(() => {
    if (!hasSynthesis()) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!hasSynthesis()) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  const total = chunksRef.current.length;
  return { supported, playing, paused, rig: spec.rig, progress: total ? index / total : 0, start, pause, resume, stop };
}

/**
 * Prose into speakable chunks.
 *
 * Markdown furniture is stripped rather than spoken: a voice that says "asterisk
 * asterisk Notice conditions asterisk asterisk" is reading the file, not the
 * entry. Tables go entirely, because a table read left to right in one voice is
 * noise, and on the three pages where the table IS the entry the reader needs
 * to see it anyway.
 */
export function splitForSpeech(markdown: string): string[] {
  const prose = markdown
    // Tables: every line that is a row.
    .replace(/^\|.*\|$/gm, "")
    // The Terminologies / Notice conditions foot. It is small print, and small
    // print recited at the same volume as the story is not small print.
    .split(/\n\n---\n\n/)[0]
    // The dateline blockquote is the masthead, and it is set as a masthead on
    // the page. Spoken, it would be the first thing heard, which puts a filing
    // slug ahead of the first sentence.
    .replace(/^>[^\n]*\n/, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  const out: string[] = [];
  for (const para of prose.split(/\n\n+/)) {
    const clean = para.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    // Sentence-ish. Long paragraphs are split further so no single utterance
    // runs past the browser's cut-off; short ones stay whole so the pauses fall
    // where the writing put them.
    const sentences = clean.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) ?? [clean];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > 240 && buf) {
        out.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}
