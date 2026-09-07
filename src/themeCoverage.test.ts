import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The bug this repo just fixed had two halves: scenes hardcoded their colours,
 * AND an alternate theme overrode only some tokens. Fixing the first without
 * guarding the second just moves the silent gap one layer down — the scenes
 * would follow tokens correctly, into a theme that forgot to set them.
 */

const css = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8");

/** The scene palette — the tokens r3f/canvas read through themeColor.ts. */
const SCENE_TOKENS = [
  "--color-signal",
  "--color-signal-dim",
  "--color-probe",
  "--color-warn",
  "--color-danger",
  "--color-alt",
  "--color-text",
  "--color-text-dim",
];

function blockFor(selector: string): string {
  const i = css.indexOf(selector);
  if (i === -1) throw new Error(`selector ${selector} not found in index.css`);
  return css.slice(i, css.indexOf("\n}", i));
}

describe("theme token coverage", () => {
  it("defines every scene token in the default @theme", () => {
    const theme = blockFor("@theme {");
    for (const t of SCENE_TOKENS) expect(theme, `@theme is missing ${t}`).toContain(`${t}:`);
  });

  it("overrides every scene token in .ink-world", () => {
    const ink = blockFor(".ink-world {");
    const missing = SCENE_TOKENS.filter((t) => !ink.includes(`${t}:`));
    expect(missing, `.ink-world does not override: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps .ink-world off literal colours where a token exists", () => {
    const ink = blockFor(".ink-world {");
    // Declarations that *consume* a colour (not the token definitions themselves)
    // must go through var(). A raw hex here is a value no theme can reach.
    const consumers = ink.split("\n").filter((l) => /^\s+(background-color|color):/.test(l));
    for (const line of consumers) {
      expect(line, `literal colour in .ink-world: ${line.trim()}`).toContain("var(--");
    }
  });

  /**
   * so-cal1-no-new-accent: .ink-world redefining --color-accent/--color-accent2
   * to ochre/terracotta is a SANCTIONED scoped theme override (see the comment
   * on that block), not a palette violation the CAL-1 sweep missed. What a
   * violation would actually look like is a THIRD place redefining either
   * token — the default drifting off amber/cyan, or a leak into some other
   * selector — so that's what this pins: exactly one root default and exactly
   * one scoped override, nothing else touches these two custom properties.
   */
  it("declares CAL-1 accent/accent2 in exactly two places: the @theme default and .ink-world", () => {
    const accentDecls = [...css.matchAll(/^\s*--color-accent:\s*#[0-9a-fA-F]{6}/gm)];
    const accent2Decls = [...css.matchAll(/^\s*--color-accent2:\s*#[0-9a-fA-F]{6}/gm)];
    expect(accentDecls, "--color-accent should be declared exactly twice").toHaveLength(2);
    expect(accent2Decls, "--color-accent2 should be declared exactly twice").toHaveLength(2);
  });

  it("keeps the @theme default CAL-1, not .ink-world's ochre/terracotta", () => {
    const theme = blockFor("@theme {");
    expect(theme).toContain("--color-accent: #f2a13d");
    expect(theme).toContain("--color-accent2: #4fd6e0");
  });
});
