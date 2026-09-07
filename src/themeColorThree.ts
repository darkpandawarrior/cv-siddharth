import { Color } from "three";
import { readToken } from "./themeColor.ts";

/**
 * Split out of themeColor.ts on purpose: this is the only half that imports
 * `three`, and importProtection denies `three` from the SSR bundle.
 * themeColor.ts is imported by modules that server-render (StoryMap.tsx,
 * blueprintShared.tsx) for `readToken` alone — those never needed a
 * three.js Color, and one shared file made all of them drag `three` into
 * the SSR graph regardless. Import this module only from code that is
 * already client-only (a WebGL scene, or a hook it calls).
 */

/** Token as a three.js Color. For r3f material and light props. */
export function readColor(varName: string, fallback: string): Color {
  return new Color(readToken(varName, fallback));
}
