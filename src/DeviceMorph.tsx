import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { projects } from "./data/profile.ts";
import { useLivePaint } from "./lib/livePaint.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { FitImage } from "./DeviceWall.tsx";

/**
 * One codebase, re-framed across form factors — running, not described.
 *
 * The claim this whole site makes is that a single Kotlin/Compose codebase
 * adapts across phone, foldable, tablet, desktop and TV. Every portfolio
 * asserts that in a bullet. This one hands you the running build and a device
 * switcher, and the layout genuinely re-flows because the frame really is a
 * different viewport — Compose Multiplatform is doing the adapting live, not a
 * carousel of screenshots pretending to.
 *
 * NOTHING IS GATED. The section is complete and readable before anything
 * boots: the copy, the device switcher and the app switcher all work against a
 * still poster. That is deliberate — `docs/SIDOS-VISION.md`'s first
 * non-negotiable is "content-forward, never gated. No 'click to launch to see
 * anything.'" The live build is an upgrade on top of a section that already
 * says its piece.
 *
 * PERFORMANCE. Each build is ~14 MB of Wasm, so it boots ONLY on an explicit
 * click, never on scroll — unlike DeviceWall's LiveEmbed, which auto-boots in
 * view because it sits deep inside a project page a visitor chose to open.
 * Exactly one iframe is ever mounted: switching apps swaps its src, switching
 * devices only resizes the frame around it, so a re-frame costs no reload and
 * the running app keeps its state while it re-lays-out.
 */

type Form = {
  id: string;
  label: string;
  /** CSS width of the viewport handed to the app. */
  width: string;
  /**
   * A number, not a CSS string. `aspectRatio` takes either, but the poster has
   * to be *measured* against the frame to decide whether cropping it is honest,
   * and a string cannot be compared. When this was "9 / 19.5" the poster was
   * cropped unconditionally: the heroes are 1000x370 banners, so a 2.7:1 image
   * was filling a 0.46:1 phone at roughly 6x, and the pre-boot state of the
   * homepage's multiplatform section was an unreadable smear of one word.
   */
  aspect: number;
  radius: string;
  /** What the width means in Android terms — the vocabulary of the job. */
  note: string;
};

/**
 * Widths are the real Android breakpoints, not decorative numbers: compact
 * (<600dp), medium (600–840dp) and expanded (>840dp) are the window size
 * classes the adaptive APIs actually switch on, so the switcher is walking a
 * visitor through the same thresholds the code does.
 */
const FORMS: Form[] = [
  { id: "phone", label: "Phone", width: "22rem", aspect: 9 / 19.5, radius: "2rem", note: "compact · <600dp" },
  { id: "foldable", label: "Foldable", width: "34rem", aspect: 5 / 4, radius: "1.2rem", note: "medium · 600–840dp" },
  { id: "tablet", label: "Tablet", width: "44rem", aspect: 4 / 3, radius: "1rem", note: "expanded · >840dp" },
  { id: "desktop", label: "Desktop", width: "56rem", aspect: 16 / 10, radius: "0.6rem", note: "expanded · resizable" },
  { id: "tv", label: "TV", width: "56rem", aspect: 16 / 9, radius: "0.4rem", note: "expanded · 10-foot" },
];

/**
 * The apps with a real web build, straight from the project registry.
 *
 * Names are cut at the em dash: `profile.ts` carries full descriptive titles
 * ("cv-siddharth — this site, and its Compose Multiplatform twin") which are
 * right on a project card and far too long for a chip in a row of four.
 */
const APPS = projects.flatMap((p) => {
  const target = p.targets?.find((t) => t.liveUrl);
  return target?.liveUrl
    ? [{
        slug: p.slug,
        name: p.name.split(" — ")[0],
        url: target.liveUrl,
        poster: `/projects/_heroes/${p.slug}.png`,
      }]
    : [];
});

export function DeviceMorph() {
  const [form, setForm] = useState(FORMS[0]);
  const [app, setApp] = useState(APPS[0]);
  const [booted, setBooted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { painted, gaveUp } = useLivePaint(iframeRef, booted);
  const { goToSection } = useSectionNav();

  if (!app) return null;

  return (
    <section id="morph" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-6xl px-6">
        <p className="section-eyebrow mb-2">
          // one codebase
        </p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Resize the device, not the screenshot</h2>
        <p className="mb-8 max-w-2xl text-zinc-400">
          These are the real Kotlin Multiplatform builds, compiled to Wasm and served from this
          domain. Change the form factor and the Compose layout re-flows at the same window size
          classes the code branches on.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {FORMS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setForm(f)}
              aria-pressed={form.id === f.id}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                form.id === f.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="kicker ml-1">{form.note}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {APPS.map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => {
                if (a.slug === app.slug) return;
                setApp(a);
                // A different build means a genuine reload; drop back to the
                // poster so the boot line is honest about what is happening.
                setBooted(false);
              }}
              aria-pressed={app.slug === a.slug}
              // `text-muted`, never text-zinc-500: the muted-on-dark tokens
              // were retired sitewide precisely because they fail AA contrast
              // (3.5–2.2:1), and e2e/a11y.spec.ts enforces color-contrast with
              // no allowlist. This row failed that gate on first run.
              className={`rounded-full border px-3.5 py-1 text-xs font-semibold transition ${
                app.slug === a.slug
                  ? "border-accent2 bg-accent2/10 text-accent2"
                  : "border-line text-muted hover:border-accent2/40 hover:text-zinc-300"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {/* A fixed band so switching form factor doesn't shove the page around
            under the reader's cursor. The device scales inside it. */}
        <div className="mt-8 flex min-h-[26rem] items-center justify-center">
          <div
            className="device relative w-full overflow-hidden transition-all duration-500"
            style={{ maxWidth: form.width, aspectRatio: form.aspect, borderRadius: form.radius }}
          >
            {/* FitImage, not a plain <img>: it letterboxes rather than crops
                once a capture is more than 20% off the frame's shape, which is
                every combination here — the heroes are 1000x370 banners and the
                narrowest frame is 9/19.5. Same component DeviceWall uses for
                the same reason, and its comment records the same bug landing
                there first ("PaymentsLab" cropped down to "mentsLab").
                ponytail: a banner letterboxed in a phone is honest but sparse;
                per-form captures would fill it, when there are per-form
                captures to use. */}
            <FitImage
              src={app.poster}
              alt=""
              targetAspect={form.aspect}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
                painted ? "opacity-0" : "opacity-100"
              }`}
            />

            {booted && (
              <iframe
                ref={iframeRef}
                key={app.slug}
                src={app.url}
                title={`${app.name} — live web build`}
                allow="fullscreen"
                className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-700 ${
                  painted ? "opacity-100" : "opacity-0"
                }`}
              />
            )}

            {!booted && (
              <button
                type="button"
                onClick={() => setBooted(true)}
                // A flat scrim, not a bottom-up gradient. The gradient was
                // transparent exactly where this label sits, which was fine
                // while the poster was cropped to a dark edge and unreadable
                // once it started letterboxing the real banner into the middle
                // of the frame — "Run Kursi here" was printing on top of
                // "Kursi — a Hinglish social-deduction bluffing game".
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-sm font-semibold text-zinc-100 transition hover:bg-ink/60 hover:text-accent"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-ink/80 text-accent">
                  <Play size={18} />
                </span>
                Run {app.name} here
                <span className="kicker font-normal">
                  ~14 MB Wasm · loads on click
                </span>
              </button>
            )}

            {booted && !painted && !gaveUp && (
              <div className="font-mono-os absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10 text-xs text-accent/80">
                <span className="boot-caret">▍</span> booting {app.name} — first load pulls the ~14&nbsp;MB Wasm…
              </div>
            )}

            {gaveUp && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10 text-center text-xs text-muted">
                The live build didn't start here — the capture above is the same screen.
              </div>
            )}
          </div>
        </div>

        <p className="kicker mt-4 text-center">
          {app.name} · {form.label} · {form.note}
        </p>

        {/* SurfaceWall (#surfaces) makes this exact claim again, 12,000px
            further down the page, with its own device-frame grid — and the
            two used to have no link between them, so a visitor who saw one
            had no reason to know the other existed. This is the forward half
            of that pair; SurfaceWall carries the matching link back up. */}
        <p className="mt-3 text-center">
          <button
            type="button"
            onClick={() => goToSection("surfaces")}
            className="kicker-accent transition hover:opacity-80"
          >
            Same one codebase, across every route on this site →
          </button>
        </p>
      </div>
    </section>
  );
}
