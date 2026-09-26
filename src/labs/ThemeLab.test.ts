import { describe, expect, it } from "vitest";
import { projects } from "../data/profile.ts";
import { BRANDS } from "./ThemeLab.tsx";

describe("ThemeLab's BRANDS", () => {
  it("is the portfolio baseline plus exactly the themed registry projects", () => {
    const themed = projects.filter((p) => p.theme);
    expect(BRANDS).toHaveLength(themed.length + 1);
    expect(BRANDS[0].name).toBe("portfolio");
  });

  it("carries every themed project's real accent and display font", () => {
    for (const p of projects.filter((p) => p.theme)) {
      const brand = BRANDS.find((b) => b.name === p.slug);
      expect(brand, p.slug).toBeDefined();
      expect(brand!.color).toBe(p.theme!.accent);
      expect(brand!.font).toBe(p.theme!.displayFont);
      expect(brand!.label).toBe(p.name);
    }
  });

  it("never invents a brand not in the registry", () => {
    const slugs = new Set(projects.map((p) => p.slug));
    for (const b of BRANDS.slice(1)) {
      expect(slugs.has(b.name), b.name).toBe(true);
    }
  });
});
