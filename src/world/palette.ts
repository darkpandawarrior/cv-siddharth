import { Color } from "three";
import { readToken } from "../themeColor";


/**
 * The world's colours, read from the CSS theme tokens.
 *
 * Every scene in this repo used to hardcode its palette, which is exactly why a
 * theme swap never reached them — the bug PR #18 fixed everywhere else. This
 * world was written in parallel with that migration and shipped with the same
 * defect: nine files of literal hex, invisible to `.ink-world` and to any theme
 * added later. This module is the fix, and it deliberately mirrors
 * themeColor.ts's contract rather than inventing a second one.
 *
 * RESOLVED AT CALL TIME, never at module scope. A module-level constant would
 * freeze whichever theme happened to be applied at import, which is the same
 * class of bug one layer up — see themeColor.ts's own comment on that.
 *
 * The fallbacks are the values this world shipped with, so a missing token
 * degrades to the design that was tested rather than to black.
 */
export function worldPalette() {
  // ONE getComputedStyle for the whole palette, not one per token. themeColor's
  // readToken is right for a scene reading two or three colours; this world
  // reads twelve, and each readToken call forces its own style recalculation.
  // Same semantics — resolved at call time, never cached across calls — just
  // not paying for the lookup a dozen times over.
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback;
  return {
    /** Lit, live, active — the craft, the land rooms, the collectible glow. */
    signal: read("--color-signal", "#3ddc84"),
    /** The attenuated signal: dust, faint trim. */
    signalDim: read("--color-signal-dim", "#8ff0b4"),
    /** Idle counterpart to signal — water, thermals, checkpoint gates. */
    probe: read("--color-probe", "#5ee6ff"),
    /** The air/orbit family — sky islands, launch pads. */
    alt: read("--color-alt", "#db61ff"),
    /** Orbit artifacts, boost meter. */
    warn: read("--color-warn", "#f0883e"),
    /** Bare ground and rock: the same panel colour the site's cards use. */
    card: read("--color-card", "#171c1a"),
    /** One step up from card — kerbs, ramps, tower shafts. */
    surface: read("--color-surface", "#111514"),
    /** Scene background and fog. */
    void: read("--color-void", "#060807"),
    text: read("--color-text", "#e8efe9"),
    textDim: read("--color-text-dim", "#cfc3b2"),
    /** Channel A — the site's calibration amber. */
    accent: read("--color-accent", "#f2a13d"),
    accentDim: read("--color-accent-dim", "#c47f2a"),
    accent2: read("--color-accent2", "#4fd6e0"),
  };
}

export type WorldPalette = ReturnType<typeof worldPalette>;

/**
 * A token, dimmed toward the background.
 *
 * Some surfaces need a shade the palette does not name — the floor grid's
 * section lines want "signal, but four-fifths of the way to the void". The
 * alternative is a literal like the #2c5f47 this world shipped with, which is
 * invisible to every theme; deriving it keeps the relationship to the token, so
 * a theme that changes --color-signal moves the grid with it.
 */
export function dim(token: string, amount: number): string {
  return `#${new Color(token).lerp(new Color(readToken("--color-void", "#060807")), amount).getHexString()}`;
}
