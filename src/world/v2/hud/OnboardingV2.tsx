import { useEffect, useState } from "react";

const SEEN_KEY = "playground:v2:onboarded";

/**
 * Sangam's own first-run card — the contract v1's world already ships
 * (src/world/Nav.tsx's `Onboarding`), carried over here. A visitor reaching
 * `/playground?world=v2` used to land straight into a moving scene behind a
 * bare STREET/ORBIT/GLOBE pill with zero explanation of what it means, how
 * to move, or what they're looking at — compounded by nothing else on the
 * page saying so either.
 *
 * Picked up automatically by HudV2 through layers.ts's `hud/*.tsx` glob
 * (`export default` + `export const layer`) — no edit to HudV2.tsx needed,
 * the same contract `AltitudeRailV2.tsx` already uses. `order: 200` sorts it
 * last among HUD layers, so it paints over the altitude rail and everything
 * else in DOM order as well as by z-index.
 *
 * Never dismisses on any keypress or an outside click, same reasoning as
 * v1's card: the two ways out are Escape and the one button, so dragging
 * the scene or leaning on a key before reading the sentence never loses it
 * by accident. The dim scrim behind the card (not just the card's own
 * background) is the same fix `Nav.tsx`'s Onboarding needed for its own
 * "THE PARTICLE FORGE" bleed-through — a world-space label sprite sitting
 * behind a translucent card can still peek through at its rounded edge.
 */
function useDismissed(): { dismissed: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private browsing — it just shows again next time */
    }
  };

  useEffect(() => {
    if (dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissed]);

  return { dismissed, dismiss };
}

export default function OnboardingV2() {
  const { dismissed, dismiss } = useDismissed();
  if (dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink/55" />
      <div className="pointer-events-auto relative w-full max-w-md rounded-2xl border border-line bg-card p-6 text-center">
        {/* .kicker-accent (index.css): the house eyebrow-label class, not a
            hand-rolled arbitrary-value pair (a small font size plus wide
            letter spacing) — src/design/designSystem.test.ts's ratchet
            counts exactly that shape of Tailwind class as drift, and a new
            file starts at a baseline of zero. */}
        <p className="kicker-accent">// sangam, world v2</p>
        <h2 className="font-display mt-2 text-2xl font-bold">One valley, drawn from real activity.</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Drag to orbit the camera around the growth model below — every shape in it comes from a real ledger, not
          placed by hand. The pill, top right, jumps between this street view, the map and the globe;{" "}
          <b className="text-zinc-300">Reality</b> explains what you're looking at.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export const layer = { id: "onboarding", order: 200 };
