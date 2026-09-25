import { describe, expect, it } from "vitest";

import { FORMS } from "./forms.ts";
import { GRAMMAR } from "./grammar.ts";
import { STREAMS } from "./streams.ts";

/**
 * D6 (living-ledger-spec §3.4, master-plan M16): `forms.ts` maps each
 * governed `FormId` to exactly one meaning; no two GRAMMAR rules or STREAMS
 * entries bind the same GOVERNED form. Scoped to `FORMS`'s own keys — those
 * are the ones history has already collided on (forms.ts's own docstring);
 * a plain, ungoverned form id like "deck-lamp" is free to be reused by
 * several STREAMS entries or GRAMMAR rules on purpose (a build-time rule
 * and its live stream counterpart sharing a visual, for instance) and is
 * never checked here.
 */
function formIds(form: string | string[]): string[] {
  return Array.isArray(form) ? form : [form];
}

/** The checker under test: pure, so it's directly unit-testable without the
 *  real registries (break-it, G15). */
export function findGovernedFormCollisions(
  governed: readonly string[],
  rules: readonly { id: string; form: string | string[] }[],
  streams: readonly { id: string; form: string | string[] }[],
): { form: string; binders: string[] }[] {
  const bindersByForm = new Map<string, string[]>();
  for (const r of rules) {
    for (const f of formIds(r.form)) {
      if (!governed.includes(f)) continue;
      bindersByForm.set(f, [...(bindersByForm.get(f) ?? []), `grammar:${r.id}`]);
    }
  }
  for (const s of streams) {
    for (const f of formIds(s.form)) {
      if (!governed.includes(f)) continue;
      bindersByForm.set(f, [...(bindersByForm.get(f) ?? []), `stream:${s.id}`]);
    }
  }
  return [...bindersByForm.entries()].filter(([, binders]) => binders.length > 1).map(([form, binders]) => ({ form, binders }));
}

describe("forms: D6 one governed CLAIM-BEARING form, one binder", () => {
  // `claim: false` governed forms (ambient:geography, the festival kit,
  // garland) are exempt from uniqueness on purpose: forms.ts's own
  // docstring calls them decorative ("never amber/cyan/green, never opens
  // a detail panel"), so several ambient streams sharing one no-claim
  // bucket — e.g. STREAMS' river AND season both under "ambient:geography"
  // — isn't the meaning-collision D6 exists to catch (diyas/fireflies/
  // lanterns each carrying two CLAIMS was the real bug, §10 C6-C8).
  const claimBearingIds = Object.entries(FORMS)
    .filter(([, meaning]) => meaning.claim)
    .map(([id]) => id);

  it("FORMS has at least one claim-bearing entry (the check isn't vacuous)", () => {
    expect(claimBearingIds.length).toBeGreaterThan(0);
  });

  it("no claim-bearing governed form is bound by two GRAMMAR rules or STREAMS entries", () => {
    const collisions = findGovernedFormCollisions(claimBearingIds, GRAMMAR, STREAMS);
    expect(collisions).toEqual([]);
  });

  it("every claim:false governed form used by a stream is used only by claim:false streams", () => {
    const claimFalseIds = new Set(Object.entries(FORMS).filter(([, m]) => !m.claim).map(([id]) => id));
    for (const s of STREAMS) {
      for (const f of formIds(s.form)) {
        if (claimFalseIds.has(f)) expect(s.claim, `${s.id} binds ambient form "${f}"`).toBe(false);
      }
    }
  });

  it("break-it (G15): the checker actually fires on a crafted collision", () => {
    const collisions = findGovernedFormCollisions(
      ["diya"],
      [{ id: "rule-a", form: "diya" }],
      [{ id: "stream-b", form: "diya" }],
    );
    expect(collisions).toEqual([{ form: "diya", binders: ["grammar:rule-a", "stream:stream-b"] }]);
  });

  it("is not merely a pass-through (two different governed forms never collide)", () => {
    const collisions = findGovernedFormCollisions(
      ["diya", "lantern"],
      [{ id: "rule-a", form: "diya" }],
      [{ id: "stream-b", form: "lantern" }],
    );
    expect(collisions).toEqual([]);
  });

  it("every GRAMMAR rule declares a non-empty form", () => {
    for (const r of GRAMMAR) {
      for (const f of formIds(r.form)) expect(f.length, r.id).toBeGreaterThan(0);
    }
  });
});
