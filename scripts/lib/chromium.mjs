import { existsSync } from "node:fs";

/**
 * A headless-capable Chromium, or undefined.
 *
 * Shared by the two generators that rasterize HTML (gen-og.mjs,
 * gen-project-heroes.mjs) because the list was previously Linux-only: on macOS
 * none of those paths exist, so both scripts silently skipped on the machine
 * this repo is actually developed on, and the PNGs could only ever be
 * regenerated in CI. Chrome's macOS bundle path is the fix.
 *
 * CHROMIUM_BIN still wins, for a pinned or unusual install.
 */
export const CHROMIUM =
  process.env.CHROMIUM_BIN ||
  [
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].find((p) => existsSync(p));
