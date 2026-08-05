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
});
