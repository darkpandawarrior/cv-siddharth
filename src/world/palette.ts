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
    /** Night Survey's ground base — the darkest surface tone in the scene. */
    ink: read("--color-ink", "#0a0d0c"),
    /** Seams and unlit trim — the recessed month/lane lines before they light. */
    line: read("--color-line", "#262e2b"),
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
 * The timeline's four lanes (`src/data/timeline.ts`'s own order: work,
 * chess, writing, opensource — see art-direction doc §5's table), as their
 * fixed colour tokens. One place for that mapping so Terrain.tsx's baked
 * GLSL literals and Wake.tsx's per-vertex ribbon colour can't quietly
 * disagree about which lane is which hue.
 */
export function laneColors(c: WorldPalette): readonly [string, string, string, string] {
  return [c.signal, c.probe, c.accent, c.text];
}

/**
 * Snap any site tint onto the world's own palette.
 *
 * src/data/surfaces.ts gives every surface a tint for its tile on the
 * homepage wall, and those are drawn from the SITE's palette, which is wider
 * than this world's — /blueprint is #db61ff, a violet that is a perfectly
 * legitimate --color-alt out there and is not one of the four colours in
 * here. Used raw, it put a magenta label and a magenta ground glow in a
 * corridor whose whole identity is four lanes and nothing else.
 *
 * The answer is not to change the surface's tint, which is correct on the
 * wall. It is that the world reads site colour through its own palette,
 * which is what this does: nearest lane colour by hue, so a room keeps its
 * relative identity without importing a fifth hue.
 */
export function worldTint(hex: string, c: WorldPalette): string {
  const lanes = laneColors(c);
  const h = (v: string) => {
    const n = parseInt(v.replace("#", ""), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return -1; // achromatic: matches the text lane
    const deg = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (deg * 60 + 360) % 360;
  };
  const target = h(hex);
  if (target < 0) return c.text;
  let best = lanes[0], bestD = Infinity;
  for (const lane of lanes) {
    const lh = h(lane);
    if (lh < 0) continue;
    const d = Math.min(Math.abs(lh - target), 360 - Math.abs(lh - target));
    if (d < bestD) { bestD = d; best = lane; }
  }
  return best;
}

/**
 * A room's lane colour, chosen by WHAT THE ROOM IS rather than by the hue of
 * its tile.
 *
 * worldTint below snaps a site tint to the nearest lane by hue, which worked
 * only for as long as the site's tints happened to be spread across the colour
 * wheel. They are not any more: the registry deliberately collapsed eight
 * accents to three so the homepage wall would read as calibrated instead of
 * decorative, and all three land within ten degrees of each other (33, 39, 43).
 * Every pavilion, every ground glow and every label in this world therefore
 * snapped to the same amber, and the corridor's whole identity is that it has
 * four lanes.
 *
 * Hue was always a proxy for meaning. The registry already records the meaning
 * directly, as a group, and this world already has exactly four lanes with
 * exactly those meanings: timeline.ts orders them work, chess, writing,
 * opensource, and laneColors returns them in that order. So the mapping is a
 * statement rather than a measurement, and a tile can be recoloured on the wall
 * without the world changing at all.
 *
 * palette.test.ts asserts the four groups reach four different lanes, so a
 * future palette change cannot quietly flatten this again the way the last one
 * did.
 */
export function worldLane(group: string | undefined, c: WorldPalette): string | null {
  const lanes = laneColors(c);
  switch (group) {
    // The case studies and the evidence: this is the work lane.
    case "proof":
      return lanes[0];
    // The corpora he keeps rather than builds, chess and anime among them,
    // which is the lane the chess strand already owns.
    case "corpus":
      return lanes[1];
    case "writing":
      return lanes[2];
    // The rooms that run: demos, instruments, the site watching itself. The
    // fourth lane, the one the timeline calls opensource.
    case "runs":
      return lanes[3];
    default:
      return null;
  }
}

/**
 * The read-line cursor's own colour — signal mixed toward white (Night
 * Survey art-direction doc §2's `readhead` row). Not a CSS token: it is
 * deliberately "the one colour nothing else in the world is allowed to be",
 * so it is a fixed literal rather than something `worldPalette()` resolves.
 */
export const READHEAD_HEX = "#d8fbe6";

/**
 * A token, dimmed toward the background.
 *
 * Some surfaces need a shade the palette does not name — the floor grid's
 * section lines want "signal, but four-fifths of the way to the void". The
 * alternative is a literal like the #2c5f47 this world shipped with, which is
 * invisible to every theme; deriving it keeps the relationship to the token, so
 * a theme that changes --color-signal moves the grid with it.
 */
export function mix(a: string, b: string, amount: number): string {
  return `#${new Color(a).lerp(new Color(b), amount).getHexString()}`;
}

export function dim(token: string, amount: number): string {
  return `#${new Color(token).lerp(new Color(readToken("--color-void", "#060807")), amount).getHexString()}`;
}
