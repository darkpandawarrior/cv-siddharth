import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { repoStats } from "./repoStats.ts";
import { surfaces } from "./surfaces.ts";

/**
 * The README is outward facing and it makes checkable claims. This is the same
 * gate src/data/surfaces.test.ts puts on the registry's spelled-out counts, for
 * the same reason: the site advertised "twenty short stories" against a corpus
 * of thirty-four, and "619 unit tests" against a suite of 812, because both
 * numbers were typed once and then trusted.
 */
const README = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const ROOT = new URL("../../", import.meta.url).pathname;

/**
 * public/llms.txt and public/llms-full.txt are what an AI crawler reads at
 * cv-siddharth.vercel.app/llms.txt. They were hand-written mirrors of
 * profile.ts for a year and drifted the LOC figure, the Play Store turnaround,
 * Mileway's module count, HireSignal's merged-PR count, the published-post
 * list and the whole current-employer row — and the Compose twin's
 * CvProfileData.kt was transcribed from the stale copy, so the drift crossed
 * into a second repo. scripts/gen-system-prompt.mjs emits them now; this
 * regenerates both in memory and compares them to what is committed, which is
 * the difference between "generated" and "generated once".
 *
 * The specifier is assembled at runtime on purpose: the generator is a .mjs,
 * this project does not set `allowJs`, and a literal import path would fail
 * `tsc -b` for want of a declaration file.
 */
const generated = (await import(new URL("../../scripts/gen-system-prompt.mjs", import.meta.url).href)) as {
  llmsTxt: string;
  llmsFullTxt: string;
};
const LLMS = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
const LLMS_FULL = readFileSync(join(ROOT, "public/llms-full.txt"), "utf8");
const STALE = "run `npm run gen:system-prompt` — this file is generated from src/data/profile.ts";

describe("the public llms files are generated, not hand-mirrored", () => {
  it("has public/llms.txt exactly as the generator emits it", () => {
    expect(LLMS, STALE).toBe(generated.llmsTxt);
  });

  it("has public/llms-full.txt exactly as the generator emits it", () => {
    expect(LLMS_FULL, STALE).toBe(generated.llmsFullTxt);
  });

  /*
   * The equality above only pins disk to the generator; it would stay green if
   * the generator itself went back to handing crawlers URLs that need
   * JavaScript. These two are the content contract. `/#resume` and
   * `/#loopdown` resolved only through the HashCompat useEffect in
   * __root.tsx — i.e. never, for the clients this file exists to serve.
   */
  it("points agents at real paths, not the client-only legacy forms", () => {
    for (const f of [LLMS, LLMS_FULL]) {
      // The URL forms, not the prose: "Notes for agents" names both legacy
      // shapes in order to tell a crawler not to use them.
      expect(f).not.toContain(".app/?project=");
      expect(f).not.toContain(".app/#resume");
      expect(f).not.toContain(".app/#loopdown");
    }
  });

  it("links every registered surface, so the site map cannot go short", () => {
    for (const s of surfaces) {
      expect(LLMS, `${s.to} is a registered surface and llms.txt should link it`).toContain(
        `(https://cv-siddharth.vercel.app${s.to})`,
      );
    }
  });
});

describe("the README's numbers are the repo's numbers", () => {
  it("states the real unit test count and file count", () => {
    expect(README, `README should say ${repoStats.tests} unit tests`).toContain(
      `${repoStats.tests} unit tests across ${repoStats.testFiles} files`,
    );
  });

  /*
   * The test above compares the README to a GENERATED file, so when repoStats.ts
   * is itself stale the two agree with each other and the gate passes on a wrong
   * number. That is not hypothetical: it is how the README shipped 817/74 into a
   * PR against a suite of 899/81. It only failed in CI, because CI runs
   * gen-repo-stats before vitest and a developer does not.
   *
   * So the generated half gets its own check against something nothing
   * generates. Walked rather than globbed because the suite spans src/, api/
   * and scripts/.
   *
   * WHAT THIS DOES NOT COVER, said out loud because it has now failed that way
   * once. This asserts `testFiles` only, on the reasoning that a drifted file
   * count proves the record is stale. The converse does not hold: adding ten
   * tests to files that already exist leaves the count correct and the TOTAL
   * ten short, which is exactly how 1045 shipped against a suite of 1058 — the
   * number `profile.ts` renders as a headline CV metric. Nothing here can
   * cheaply assert the total; only `vitest list` knows it, which is why
   * gen-repo-stats.mjs is in check-generated.mjs's DETERMINISTIC set. That
   * script is the guard for the total. This one is the guard for the shape.
   */
  it("has not let the generated stats go stale under it", () => {
    const skip = new Set(["node_modules", "dist", ".git", "e2e", ".vercel", "coverage", ".worktrees"]);
    const walk = (dir: string): number => {
      let n = 0;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || skip.has(e.name)) continue;
        if (e.isDirectory()) n += walk(join(dir, e.name));
        else if (/\.test\.(ts|tsx|mjs)$/.test(e.name)) n += 1;
      }
      return n;
    };
    expect(
      walk(ROOT),
      "src/data/repoStats.ts is stale — run `npm run gen:repo-stats` and update the README",
    ).toBe(repoStats.testFiles);
  });

  it("states the real Playwright file count", () => {
    const specs = readdirSync(join(ROOT, "e2e")).filter((f) => f.endsWith(".spec.ts")).length;
    expect(README, `README should say ${specs} e2e spec files`).toMatch(
      new RegExp(`Playwright tests across ${specs} files`),
    );
  });

  /*
   * The file count above is not the test count: test.each and nested describes
   * mean N spec files hold a different number of actual tests, and only the
   * file half of that sentence was ever checked mechanically. The audit that
   * asked for this test found the README saying 115 against a suite that had
   * already grown past it. This asks Playwright itself, the same source
   * `npm run test:e2e` runs against, so the number can only be wrong in one
   * place going forward.
   */
  it("states the real Playwright test count, not just the file count", () => {
    const out = execFileSync("npx", ["playwright", "test", "--list"], {
      encoding: "utf8",
      cwd: ROOT,
    });
    const m = /Total: (\d+) tests in (\d+) files/.exec(out);
    expect(m, "playwright test --list should print a Total line").not.toBeNull();
    const [, total] = m!;
    expect(README, `README should say ${total} Playwright tests`).toContain(`${total} Playwright tests across`);
  });

  it("counts the destinations the registry actually has", () => {
    const words: Record<number, string> = {
      15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen",
      19: "nineteen", 20: "twenty", 21: "twenty-one", 22: "twenty-two",
    };
    const word = words[surfaces.length];
    expect(word, `add a word for ${surfaces.length} to this test`).toBeDefined();
    expect(README, `the registry holds ${surfaces.length} surfaces`).toContain(`**${word} destinations**`);
  });

  /*
   * The prose word above went stale for two full routes while staying green,
   * because it only checks the WORD "twenty destinations", never that the
   * table actually lists twenty rows. /canon and /making shipped with a
   * registry entry each and no table row for either. This checks the table
   * itself: every registered surface needs its own linked row, not just an
   * accurate headcount above it.
   */
  it("lists every registered surface as its own table row", () => {
    for (const s of surfaces) {
      const row = `[\`${s.to}\`](https://cv-siddharth.vercel.app${s.to})`;
      expect(README, `${s.to} is a registered surface and needs its own README table row`).toContain(row);
    }
  });

  it("counts the client-only routes, which is a claim about rendering", () => {
    const routes = readdirSync(join(ROOT, "src/routes")).filter((f) => f.endsWith(".tsx"));
    const clientOnly = routes.filter((f) =>
      /^\s*ssr: false,\s*$/m.test(readFileSync(join(ROOT, "src/routes", f), "utf8")),
    );
    // Derived, not typed. Both halves of this sentence were literals and both
    // went stale the moment /canon landed: the file count said twenty-two
    // against twenty-three files, and this assertion stayed green through it
    // because it only compared one hardcoded string to another.
    const NUM: Record<number, string> = {
      // Small numbers too, now that the client-only count is derived from this
      // same table rather than hardcoded.
      5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine",
      16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen",
      20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three",
      24: "Twenty-four", 25: "Twenty-five", 26: "Twenty-six", 27: "Twenty-seven",
    };
    const ssr = NUM[routes.length - clientOnly.length];
    const total = NUM[routes.length]?.toLowerCase();
    expect(ssr, `add a word for ${routes.length - clientOnly.length} to NUM`).toBeDefined();
    expect(total, `add a word for ${routes.length} to NUM`).toBeDefined();
    expect(README).toContain(`${ssr} of the ${total} route files server-render`);
    // Derived, like the sentence above it. This was `toBe(6)` — a hardcoded
    // literal inside the very test whose comment complains about hardcoded
    // literals going stale, and it went stale the moment /ops landed as the
    // seventh client-only route. Assert the README's own word for the count
    // instead, so the number can only be wrong in one place.
    const clientWord = NUM[clientOnly.length];
    expect(clientWord, `add a word for ${clientOnly.length} to NUM`).toBeDefined();
    const marker = `${clientWord} stay client-only`;
    expect(README, `the README should say ${marker}`).toContain(marker);
    /*
     * Checked against just the sentence naming the routes, not the whole
     * README: every clientOnly route is genuinely a route somewhere on the
     * site, so `toContain` against the full file passed for /ops from its
     * OWN surfaces-table row while the "stay client-only" sentence still
     * named only six of the seven routes it claimed. A route can be named
     * anywhere in the file and still be missing from the one sentence that
     * matters.
     */
    const start = README.indexOf(marker);
    const end = README.indexOf(".", start + marker.length);
    const sentence = README.slice(start, end === -1 ? undefined : end + 1);
    for (const f of clientOnly) {
      const route = "/" + f.replace(/\.tsx$/, "");
      expect(sentence, `${route} is client-only and the "${marker}" sentence should name it`).toContain(`\`${route}\``);
    }
  });

  /*
   * "Twenty-one gen: scripts over twenty-six generator files" was a snapshot
   * from whenever someone last counted by hand, and both halves had already
   * drifted (to 24 and 28) by the time this was written. Derived from
   * package.json and the scripts/ directory, the same two places a person
   * would actually count from, so neither number can go stale silently again.
   */
  it("counts the gen: scripts and generator files, so neither drifts unseen", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    const genScripts = Object.keys(pkg.scripts).filter((k) => k.startsWith("gen:")).length;
    const genFiles = readdirSync(join(ROOT, "scripts")).filter(
      (f) => /^gen-.*\.mjs$/.test(f) && !f.endsWith(".test.mjs"),
    ).length;
    const scriptWords: Record<number, string> = {
      20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three",
      24: "Twenty-four", 25: "Twenty-five", 26: "Twenty-six",
    };
    const fileWords: Record<number, string> = {
      24: "twenty-four", 25: "twenty-five", 26: "twenty-six",
      27: "twenty-seven", 28: "twenty-eight", 29: "twenty-nine", 30: "thirty",
      31: "thirty-one",
    };
    const scriptWord = scriptWords[genScripts];
    const fileWord = fileWords[genFiles];
    expect(scriptWord, `add a word for ${genScripts} to scriptWords`).toBeDefined();
    expect(fileWord, `add a word for ${genFiles} to fileWords`).toBeDefined();
    expect(README, `README should say ${scriptWord} gen: scripts over ${fileWord} generator files`).toContain(
      `${scriptWord} \`gen:\` scripts over ${fileWord} generator files`,
    );
  });

  it("carries no dash in prose, which is this surface's rule", () => {
    // Code blocks are exempt: the tree diagram's comments are code.
    const prose = README.replace(/```[\s\S]*?```/g, "");
    const found = prose.split("\n").filter((l) => /—|–/.test(l));
    expect(found, `dashes left in README prose:\n${found.join("\n")}`).toEqual([]);
  });

  /*
   * The same rule on the two files a crawler reads, because they are prose too.
   *
   * The README has been held to this since it was written and llms.txt never
   * was, which was defensible while these files were hand-maintained on a
   * different schedule and is not now: both are emitted from profile.ts, whose
   * strings canonLore.test.ts now guards. What the data layer cannot see is the
   * generator's OWN joins, and that is exactly where the last sixteen lived,
   * two template literals stitching a metric to its detail with an em dash.
   * This is the assertion that would have caught them.
   */
  it.each([["llms.txt", LLMS], ["llms-full.txt", LLMS_FULL]])("carries no dash in %s either", (_name, text) => {
    const found = text.split("\n").filter((l) => /—|–/.test(l));
    expect(found, `dashes left in generated prose:\n${found.join("\n")}`).toEqual([]);
  });
});
