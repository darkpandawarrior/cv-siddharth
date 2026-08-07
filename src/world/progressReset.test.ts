import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PROGRESS_KEYS } from "./progressReset.ts";

/**
 * The reset has to actually reset everything.
 *
 * The bug this prevents is not in the reset function — it is in the FUTURE:
 * someone adds a seventh piece of persistence, never touches this file, and the
 * reset silently stops being a reset. So rather than test the clearing (which
 * is three lines), this scans the world's own source for localStorage keys and
 * insists every one of them is on the list.
 */
const dir = fileURLToPath(new URL(".", import.meta.url));

describe("progress reset", () => {
  it("covers every playground key the world persists", () => {
    const found = new Set<string>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      if (file.includes(".test.")) continue;
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      // [a-z0-9:] rather than [a-z:] — resolve.ts's key ends in a version
      // suffix ("playground:resolved:v1"), and a scanner blind to digits
      // would silently stop matching partway through it, defeating the
      // entire point of this test for exactly the key it most needs to catch.
      for (const match of source.matchAll(/"(playground:[a-z0-9:]+)"/g)) found.add(match[1]);
    }
    const missing = [...found].filter((k) => !PROGRESS_KEYS.includes(k as never));
    expect(missing, `not cleared by resetProgress: ${missing.join(", ")}`).toEqual([]);
  });
});
