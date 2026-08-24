import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projects } from "./profile.ts";

/**
 * Every screenshot the site points at has to exist.
 *
 * profile.ts hand-keeps two arrays per project — `screens[]` (the curated
 * gallery, which OVERRIDES the auto-generated one) and each target's
 * `screens` (the DeviceWall tabs) — and both name files by string. A name
 * that never landed on disk renders as a broken image, and one of the two
 * found on 2026-08-24 was in Mileway's iOS widget tab: the DeviceWall is the
 * site's flagship "one codebase, every surface" proof, so the hole was in the
 * most load-bearing place it could have been.
 *
 * Neither unit tests nor axe nor the overflow gate can see this — a missing
 * <img> src is valid markup with an alt attribute. Only the filesystem knows.
 */
describe("every referenced screenshot exists on disk", () => {
  const root = new URL("../../", import.meta.url).pathname;

  it("finds the projects it is meant to be checking", () => {
    expect(projects.length).toBeGreaterThanOrEqual(6);
  });

  it("has no dead file reference in any gallery or device-wall target", () => {
    const missing: string[] = [];
    let checked = 0;
    for (const p of projects) {
      const dir = join(root, "public/projects", p.slug, "screenshots");
      const have = existsSync(dir) ? new Set(readdirSync(dir)) : new Set<string>();
      const refs = new Set<string>();
      for (const s of (p.screens ?? []) as { file?: string }[]) if (s.file) refs.add(s.file);
      for (const t of (p.targets ?? []) as { screens?: string[] }[]) for (const f of t.screens ?? []) refs.add(f);
      for (const f of refs) {
        checked++;
        if (!have.has(f)) missing.push(`${p.slug}/${f}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(missing, `referenced but absent:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});
