import { describe, it, expect } from "vitest";
import { surfaces } from "./data/surfaces.ts";
import { readFileSync } from "node:fs";

/**
 * The footer's docstring promises "every surface of the site... so no page is
 * a dead end". Before this test it linked 8 of 17 and had been wrong for
 * months. Asserting against the RENDERED source rather than against a sibling
 * copy of the same list is the only version of this test that can fail.
 */
describe("SiteFooter", () => {
  const src = readFileSync(new URL("./SiteFooter.tsx", import.meta.url), "utf8");

  it("derives its route columns rather than hand-listing them", () => {
    expect(src).toContain("fromRegistry(");
    // A literal `to: "/lab"` style entry would mean someone re-introduced the
    // hand-kept list beside the derived one.
    const handWritten = [...src.matchAll(/kind:\s*"route",\s*to:\s*"(\/[a-z]+)"/g)].map((m) => m[1]);
    const registryPaths = new Set(surfaces.map((s) => s.to));
    // A hand-written route entry is only legitimate if it is a declared
    // promotion. Anything else is the old drift creeping back.
    const promoted = new Set([...src.matchAll(/const PROMOTED[^=]*=\s*\[([^\]]*)\]/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().replace(/"/g, ""))).filter(Boolean));
    const shadowed = handWritten.filter((p) => registryPaths.has(p) && !promoted.has(p));
    expect(shadowed, `these registry routes are hand-listed but not declared as promotions: ${shadowed.join(", ")}`).toHaveLength(0);
    // and every promotion must actually appear as a link
    for (const p of promoted) expect(handWritten, `${p} is promoted but never linked`).toContain(p);
  });

  it("reaches every registry surface through a derived group", () => {
    const groups = new Set([...src.matchAll(/fromRegistry\(([^)]*)\)/g)].flatMap((m) => m[1].split(",").map((g) => g.trim().replace(/"/g, ""))));
    const unreachable = surfaces.filter((s) => !groups.has(s.group));
    expect(unreachable.map((s) => s.to), "surfaces whose group no footer column derives").toHaveLength(0);
  });
});
