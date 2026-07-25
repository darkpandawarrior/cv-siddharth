/**
 * Voice I/O for the console, on the two Web Speech APIs the browser already
 * ships. Zero dependencies, and each half is detected independently — Firefox
 * has speechSynthesis but no SpeechRecognition, so "supported" is never one
 * flag for both.
 *
 * Everything that touches `window` does so inside an effect or a handler: this
 * component tree is server-rendered on /, /resume and /project/*, where these
 * globals don't exist.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/* ── SpeechRecognition types ──────────────────────────────────────────────
 * lib.dom.d.ts ships the *event* types (SpeechRecognitionEvent,
 * SpeechRecognitionErrorEvent, SpeechRecognitionResultList) but not the
 * recognizer itself — it's still prefixed in Chrome and unimplemented in
 * Firefox. The minimum surface we actually use, declared here rather than
 * pulled in as a @types dependency. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * What a visitor should read when the recognizer gives up. `aborted` is the
 * one we cause ourselves (closing the panel, pressing the mic again), so it
 * says nothing; every other case gets a sentence and a way to continue —
 * a silent no-op after a denied permission prompt is the worst outcome here.
 */
const RECOGNITION_ERRORS: Record<string, string | null> = {
  aborted: null,
  "no-speech": "I didn't catch anything — tap the mic and try again, or just type it.",
  "not-allowed":
    "Microphone access is blocked. Allow it for this site in your browser settings, or type your question instead.",
  "service-not-allowed":
    "Your browser wouldn't start its speech service. Type your question instead — everything works without voice.",
  "audio-capture": "No microphone found. Plug one in, or type your question instead.",
  network: "The browser's speech service couldn't be reached. Type your question instead.",
};

export interface SpeechInput {
  /** false on Firefox and anywhere else without a recognizer — hide/disable the control. */
  supported: boolean;
  listening: boolean;
  /** A sentence to show the visitor, or null. Cleared when listening restarts. */
  error: string | null;
  /** Starts a session. `onTranscript(text, final)` fires on every interim update. */
  start: () => void;
  /** Ends the session, keeping whatever was heard. */
  stop: () => void;
  /** Throws the session away (panel closed, component unmounted). */
  cancel: () => void;
}

/**
 * Speech → text. Interim results stream to `onTranscript` so the words appear
 * as they're spoken; the caller decides what to do with the final one (this
 * console FILLS the composer rather than submitting — see FloatingChat).
 */
export function useSpeechInput(onTranscript: (text: string, final: boolean) => void): SpeechInput {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const cbRef = useRef(onTranscript);

  // Latest-callback ref, written in an effect rather than during render: the
  // recognizer's handlers outlive the render that created them.
  useEffect(() => {
    cbRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  const cancel = useCallback(() => {
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
  }, []);

  // Nothing should keep listening after the panel that started it is gone.
  useEffect(() => cancel, [cancel]);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    setError(null);
    const rec = new Ctor();
    // The document's own language, so a browser set to another locale doesn't
    // silently transcribe English as if it were that language.
    rec.lang = document.documentElement.lang || "en-US";
    rec.continuous = false; // one question per press — this is a composer, not dictation
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      // The whole session, not just the changed slice: the caller replaces the
      // composer's contents with this, so it has to be the full utterance.
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      cbRef.current(text.trim(), e.results[e.results.length - 1]?.isFinal ?? false);
    };
    rec.onerror = (e) => {
      const message = RECOGNITION_ERRORS[e.error];
      setError(message === undefined ? "Voice input stopped unexpectedly — type your question instead." : message);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      // start() throws if a session is already running in another tab/instance.
      setError("Voice input is busy — try again in a moment, or type your question.");
    }
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  return { supported, listening, error, start, stop, cancel };
}

export interface SpeechOutput {
  /** false where speechSynthesis doesn't exist — hide/disable the control. */
  supported: boolean;
  /** Explicit opt-in, default OFF. Audio never starts on its own. */
  enabled: boolean;
  speaking: boolean;
  toggle: () => void;
  /** No-ops unless `enabled` — the gate lives here so no caller can forget it. */
  speak: (text: string) => void;
  stop: () => void;
}

/**
 * Text → speech. Off by default and session-only (deliberately NOT persisted:
 * a remembered "on" would mean a returning visitor gets audio without touching
 * anything, which is the autoplay this is meant to avoid).
 */
export function useSpeechOutput(): SpeechOutput {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // Has this page ever queued an utterance? Until it has, there is nothing to
  // cancel — and calling cancel() anyway is not free: it's the call that wakes
  // the platform's speech engine, which on a cold machine costs real seconds
  // (measured: it stalled first paint by ~20s across parallel headless
  // browsers). The panel stops speech on mount, on close and on every new
  // message, so that would have been a wake-up on every single page load.
  const startedRef = useRef(false);

  useEffect(() => setSupported(typeof window !== "undefined" && "speechSynthesis" in window), []);

  const stop = useCallback(() => {
    if (startedRef.current) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  // Leaving the page mid-sentence must not leave a voice running: speech
  // synthesis outlives the component (and, in some browsers, the page).
  useEffect(() => stop, [stop]);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const clean = text.trim();
      if (!clean) return;
      startedRef.current = true;
      window.speechSynthesis.cancel(); // never queue — the newest reply is the one that matters
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = document.documentElement.lang || "en-US";
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [enabled],
  );

  const toggle = useCallback(() => {
    setEnabled((on) => {
      if (on) stop(); // turning it off stops mid-sentence rather than finishing
      return !on;
    });
  }, [stop]);

  return { supported, enabled, speaking, toggle, speak, stop };
}
