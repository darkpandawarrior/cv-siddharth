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
      for (const match of source.matchAll(/"(playground:[a-z:]+)"/g)) found.add(match[1]);
    }
    const missing = [...found].filter((k) => !PROGRESS_KEYS.includes(k as never));
    expect(missing, `not cleared by resetProgress: ${missing.join(", ")}`).toEqual([]);
  });
});
