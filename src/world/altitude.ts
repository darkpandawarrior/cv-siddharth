// GLOBE/ORBIT/STREET route classification and the focus/at hand-off table
// (living-ledger-spec.md#6.1-6.2). Pure: no React, no three, no DOM -- the
// AltitudeRail and the room routes (a later lane) call these to know which
// altitude a pathname is and where the camera should arrive when a visitor
// crosses to another one. Unknown pathnames and unknown from/to pairs never
// throw; they fall back to the plain room URL.

export type Altitude = "street" | "orbit" | "globe";

/** STREET (`/playground`) is the default: every unrecognised pathname,
 *  including "/", lands there rather than throwing. */
export function altitudeFor(pathname: string): Altitude {
  if (pathname.startsWith("/map")) return "orbit";
  if (pathname.startsWith("/globe")) return "globe";
  return "street";
}

/** The plain room URL for an altitude, with no focus/at carried over --
 *  what a hand-off falls back to when it has nothing more specific to say. */
function defaultUrl(altitude: Altitude): string {
  if (altitude === "orbit") return "/map";
  if (altitude === "globe") return "/globe";
  return "/playground";
}

/**
 * The four rows of the focus hand-off table (living-ledger-spec.md#6.2) --
 * the camera arrives looking at the thing you left:
 *
 * | From              | To    | URL                          | Arrival                       |
 * |-------------------|-------|------------------------------|--------------------------------|
 * | STREET at a landmark | ORBIT | `/map?focus=<slug>`       | that node centred and lit     |
 * | STREET at the Sangam | ORBIT | `/map?focus=kmp-family`   | the foundation node           |
 * | ORBIT             | GLOBE | `/globe?focus=pune`          | Pune, on its real day/night side |
 * | GLOBE/ORBIT node  | STREET | `/playground?at=<slug>`     | the hodi moored there (or the daypart spawn) |
 *
 * The Sangam row is the landmark row with slug `"kmp-family"` -- same shape,
 * same code path, so it is not special-cased. GLOBE and ORBIT both hand off
 * to STREET the same way. Any other `(from, to)` pair, or a `to` this table
 * has no row for, falls back to that altitude's plain room URL.
 */
export function focusHandoffUrl(from: Altitude, to: Altitude, slug?: string): string {
  if (from === "street" && to === "orbit") {
    return slug ? `/map?focus=${encodeURIComponent(slug)}` : defaultUrl("orbit");
  }
  if (from === "orbit" && to === "globe") {
    return "/globe?focus=pune";
  }
  if ((from === "globe" || from === "orbit") && to === "street") {
    return slug ? `/playground?at=${encodeURIComponent(slug)}` : defaultUrl("street");
  }
  return defaultUrl(to);
}
