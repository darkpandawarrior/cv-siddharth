import { describe, it, expect } from "vitest";
import { projects } from "./projects.ts";
import { projectCards } from "./projectCards.ts";

/**
 * projectCards.ts is a light, hand-kept projection of projects.ts (see its
 * own docstring for why it isn't a live generator) — this is the guard that
 * makes "hand-kept" safe. Same slugs, same order, and the shared fields
 * match byte for byte; only Project.detail/screens/theme/targets/icon are
 * allowed to differ, because those are exactly the heavy fields this file
 * exists to leave behind.
 */
describe("projectCards stays in sync with projects", () => {
  it("carries every project, same slugs and order", () => {
    expect(projectCards.map((p) => p.slug)).toEqual(projects.map((p) => p.slug));
  });

  it("never drifts on a field it duplicates", () => {
    const drift: string[] = [];
    for (const full of projects) {
      const card = projectCards.find((p) => p.slug === full.slug);
      if (!card) { drift.push(`${full.slug}: missing from projectCards`); continue; }
      for (const key of ["name", "tagline", "status"] as const) {
        if (card[key] !== full[key]) drift.push(`${full.slug}.${key}: card="${card[key]}" full="${full[key]}"`);
      }
      if (JSON.stringify(card.stack) !== JSON.stringify(full.stack)) drift.push(`${full.slug}.stack differs`);
      if (JSON.stringify(card.highlights) !== JSON.stringify(full.highlights)) drift.push(`${full.slug}.highlights differs`);
      if (JSON.stringify(card.badges) !== JSON.stringify(full.badges)) drift.push(`${full.slug}.badges differs`);
      if (card.tier !== full.tier) drift.push(`${full.slug}.tier: card=${card.tier} full=${full.tier}`);
    }
    expect(drift, `projectCards.ts fell out of sync with projects.ts — re-copy these fields by hand:\n  ${drift.join("\n  ")}`).toEqual([]);
  });
});
