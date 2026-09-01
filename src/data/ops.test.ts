import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { perimeter, leverage, drift } from "./ops.ts";
import { incidents } from "./incidents.ts";
import { slaFor, generatorFor, stateForAge, ageDays, STAMP_RE } from "./freshnessSla.ts";

/**
 * The healing pillar, applied to the healing dashboard.
 *
 * /ops exists to report when something on this site has quietly stopped being
 * true. A board that could itself drift — a perimeter row for a file that no
 * longer exists, a generator command that is not a real npm script, an
 * incident linking to a test that was deleted — would be the exact defect it
 * was built to catch, dressed up as a dashboard. So every field it renders is
 * asserted against its source module here.
 *
 * Link RESOLUTION is deliberately not checked over the network: a test that
 * makes ~40 HTTP requests is a test that goes red when GitHub rate-limits, and
 * a flaky gate is one nobody trusts. What is checked is everything the repo can
 * know for itself — that local paths exist, that npm scripts exist, that every
 * row carries both of its two links, and that the URLs are well-formed.
 */
describe("/ops cannot lie about itself", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  describe("the freshness perimeter", () => {
    it("watches something", () => {
      expect(perimeter.length).toBeGreaterThanOrEqual(3);
    });

    it("names only files that exist and still carry a stamp", () => {
      const bad = perimeter.filter((p) => {
        const f = join(root, "src", "data", p.file);
        if (!existsSync(f)) return true;
        return !STAMP_RE.test(readFileSync(f, "utf8"));
      });
      expect(bad.map((b) => b.file), "perimeter rows for files that are gone or unstamped").toEqual([]);
    });

    it("uses the SAME SLA the freshness gate enforces", () => {
      // The whole reason freshnessSla.ts exists. If these drift, the board can
      // render OK on 45 days while the test fails at 21.
      const drift = perimeter.filter((p) => p.slaDays !== slaFor(p.file));
      expect(drift.map((d) => `${d.file}: board ${d.slaDays} vs gate ${slaFor(d.file)}`)).toEqual([]);
    });

    it("names a generator that is a real npm script", () => {
      const bad = perimeter.filter((p) => {
        expect(p.generator).toBe(generatorFor(p.file));
        return !(p.generator.replace("npm run ", "") in pkg.scripts);
      });
      expect(bad.map((b) => b.generator), "perimeter names generators that do not exist").toEqual([]);
    });

    it("carries a stamp the board can actually age", () => {
      for (const p of perimeter) {
        expect(Number.isFinite(ageDays(p.generatedAt)), `${p.file} has an unparseable stamp`).toBe(true);
      }
    });
  });

  describe("the leverage board", () => {
    it("lists the convention plugins", () => {
      expect(leverage.length).toBeGreaterThanOrEqual(15);
    });

    it("gives every plugin a shared.* id and a non-negative module count", () => {
      for (const l of leverage) {
        expect(l.id).toMatch(/^shared\.[a-z.]+$/);
        expect(l.modules).toBeGreaterThanOrEqual(0);
      }
    });

    it("never claims a module count without naming a repo it came from", () => {
      const unsourced = leverage
        .filter((l) => l.modules > 0 && (l.repos as readonly string[]).length === 0)
        .map((l) => l.id);
      expect(unsourced, "a count with no repo behind it is unverifiable").toEqual([]);
    });
  });

  describe("the incident ledger", () => {
    it("has history rather than empty state", () => {
      expect(incidents.length).toBeGreaterThanOrEqual(5);
    });

    it("gives every incident both of its two links", () => {
      for (const i of incidents) {
        expect(i.subjectHref, `${i.id} has no SUBJECT link`).toMatch(/^https?:\/\//);
        expect(i.evidenceHref, `${i.id} has no VERIFIED link`).toMatch(/^https?:\/\//);
      }
    });

    it("points every in-repo evidence link at a file that exists", () => {
      const PREFIX = "https://github.com/darkpandawarrior/cv-siddharth/blob/main/";
      const dead = incidents
        .flatMap((i) => [i.subjectHref, i.evidenceHref])
        .filter((u) => u.startsWith(PREFIX))
        .filter((u) => !existsSync(join(root, u.slice(PREFIX.length))))
        .map((u) => u.slice(PREFIX.length));
      expect(dead, `the ledger cites files that are gone: ${dead.join(", ")}`).toEqual([]);
    });

    it("has unique ids", () => {
      const dupes = incidents.map((i) => i.id).filter((id, idx, a) => a.indexOf(id) !== idx);
      expect(dupes).toEqual([]);
    });

    it("records a resolution time for anything marked resolved", () => {
      for (const i of incidents.filter((x) => x.resolved)) {
        expect(Number.isInteger(i.days), `${i.id} is resolved with no days-to-fix`).toBe(true);
      }
    });
  });

  describe("the vendored drift board", () => {
    it("measures the submodule pins", () => {
      expect(drift.length).toBeGreaterThanOrEqual(4);
    });

    it("reports an unfetched pin as unmeasured, never as zero", () => {
      // HireSignal pins a kmp-build-logic commit the local clone has never
      // fetched. `behind: null` is the honest answer; `0` would be a lie that
      // reads as "perfectly up to date".
      for (const d of drift) {
        expect(d.behind === null || Number.isInteger(d.behind), `${d.repo}/${d.upstream}`).toBe(true);
        if (d.behind === null) expect(d.pinnedAt).toBeNull();
      }
    });

    it("names a real upstream and a short sha", () => {
      for (const d of drift) {
        expect(["kmp-toolkit", "kmp-build-logic"]).toContain(d.upstream);
        expect(d.pin).toMatch(/^[0-9a-f]{7}$/);
      }
    });
  });

  describe("the leverage board does not count vendored copies", () => {
    /**
     * The generator used to walk each consumer's `external/` submodules, which
     * counted upstream modules once per consumer and counted every plugin's own
     * declaration file as a consumer of itself: shared.android.library shipped
     * as 63 against a true 24, and ten rows with a real count of zero rendered
     * green. This pins the corrected shape rather than the exact numbers, which
     * legitimately move.
     */
    it("never reports a consumer count inflated past the modules that exist", () => {
      const top = Math.max(...leverage.map((l) => l.modules));
      expect(top, "a count this high means external/ is being walked again").toBeLessThan(45);
    });

    it("does not credit a plugin to a repo that applies nothing", () => {
      for (const l of leverage) {
        if (l.modules === 0) {
          expect((l.repos as readonly string[]).length, `${l.id} claims repos with 0 modules`).toBe(0);
        }
      }
    });
  });

  describe("the board never claims access it does not have", () => {
    /**
     * The owner's rule, and the reason the fleet block carries a provenance
     * note: nothing on /ops may imply he still has an employer's source. The
     * Play listings are public and re-checkable; the repos were never his.
     */
    it("says nowhere that employer code is tracked or held", () => {
      const board = readFileSync(join(root, "src", "OpsBoard.tsx"), "utf8");
      const forbidden = [
        /still\s+(have|has)\s+access/i,
        /tracking\s+(the\s+)?(dice|jugnoo)/i,
        /(dice|jugnoo)\s+repos?\s+(are\s+)?tracked/i,
      ];
      const hits = forbidden.filter((re) => re.test(board)).map(String);
      expect(hits, "the board implies current access to employer code").toEqual([]);
    });

    it("keeps the provenance note that says the source was never his", () => {
      const board = readFileSync(join(root, "src", "OpsBoard.tsx"), "utf8");
      expect(board, "the fleet block lost its provenance note").toMatch(/source was never\s+his/);
    });
  });

  describe("motion: arrival once, alarm forever, nothing else", () => {
    /**
     * The old rule was "exactly one @keyframes in the slice". That was the
     * right test for a page with one animation and the wrong one the moment a
     * second was allowed: it would have gone red on an animation that was
     * perfectly guarded, and stayed green on an unguarded one if a guarded one
     * were deleted in the same change. How many animations exist was never the
     * point. What matters is that every one of them says what a visitor who
     * asked for less motion gets instead, and that only BROKEN never stops.
     */
    const css = readFileSync(join(root, "src", "index.css"), "utf8");
    /* From the /ops comment to EOF. /pulse's three keyframes sit immediately
       above that comment on purpose — see the positional note there. */
    const opsCss = css.slice(css.indexOf("/* /ops — the board's grammar"));
    const board = readFileSync(join(root, "src", "OpsBoard.tsx"), "utf8");

    const REDUCED_RE = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g;
    /** The slice's reduced-motion block(s), concatenated. */
    const reduced = [...opsCss.matchAll(REDUCED_RE)].map((m) => m[1]).join("\n");
    /** The slice WITHOUT them, so a guard is never mistaken for a call site. */
    const normal = opsCss.replace(REDUCED_RE, "");

    const defined = [...opsCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);

    /**
     * Every `@keyframes` in the slice, as {name, body, full}, found by COUNTING
     * BRACES rather than by looking for a `}` at the start of a line.
     *
     * The two readers below used `/@keyframes[\s\S]*?\n\}/`, which silently
     * assumes a formatting convention no test enforces — the exact defect this
     * file already names one level up, where a selector list was read with
     * `.split("\n").pop()`. A keyframe written on one line was invisible to
     * both: `@keyframes x { from { color: var(--color-danger) } to { … } }`
     * sailed through the alarm-colour assertion, and the same blindness left
     * its `from {` to be mis-read as a selector by the blank-base-state check.
     * Nothing in the slice is written that way today, which is precisely why
     * it was worth fixing — the guard was reading as protection it did not give.
     */
    function keyframeBlocks(css: string): { name: string; body: string; full: string }[] {
      const out: { name: string; body: string; full: string }[] = [];
      const head = /@keyframes\s+([\w-]+)\s*\{/g;
      for (let m = head.exec(css); m; m = head.exec(css)) {
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < css.length && depth > 0; i++) {
          if (css[i] === "{") depth++;
          else if (css[i] === "}") depth--;
        }
        out.push({ name: m[1], body: css.slice(m.index + m[0].length, i - 1), full: css.slice(m.index, i) });
        head.lastIndex = i;
      }
      return out;
    }
    const keyframes = keyframeBlocks(opsCss);

    /**
     * The selector list a `[^{}]+` capture ends with, as its INDIVIDUAL parts.
     *
     * Every rule below matches its selector by running `[^{}]+` back to the
     * previous brace, which drags along whatever comment sat above it. The old
     * reduction was `.split("\n").pop()` — the last line only — and it threw
     * away every selector above the last one in a comma list. `.ops-verdict,`
     * newline `.ops-trace__node { animation: … }` therefore shipped with
     * `.ops-verdict` completely unchecked, while a comment three lines up
     * asserted the single-line convention that made the shortcut safe. A
     * convention no test enforces is a convention.
     *
     * So: strip comments, walk back from the last line for as long as the line
     * before it ends in a comma, then split on the commas. Whitespace is
     * collapsed so a descendant selector compares equal however it was wrapped.
     */
    const selectorsOf = (blob: string): string[] => {
      const lines = blob.replace(/\/\*[\s\S]*?\*\//g, "").trimEnd().split("\n");
      const parts = [lines.pop() ?? ""];
      while (lines.length && lines[lines.length - 1].trim().endsWith(",")) parts.unshift(lines.pop()!);
      return parts
        .join(" ")
        .split(",")
        .map((sel) => sel.trim().replace(/\s+/g, " "))
        .filter(Boolean);
    };

    /** Every selector the reduced-motion block actually names, as a SET. */
    const guarded = new Set(
      [...reduced.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => selectorsOf(m[1])),
    );

    /* Every `animation` / `animation-name` declaration outside the guard, with
       the selector it sits on. `animation-delay` deliberately does not match:
       a stagger on an already-guarded selector is not a second animation. */
    const applied = [...normal.matchAll(/([^{}]+)\{[^{}]*animation(?:-name)?\s*:\s*([\w-]+)/g)]
      .filter((m) => m[2] !== "none")
      .flatMap((m) => selectorsOf(m[1]).map((selector) => ({ selector, name: m[2] })));

    it("defines no keyframes nothing uses", () => {
      // Dead motion is motion nobody guarded and nobody deleted.
      expect(defined.filter((n) => !applied.some((a) => a.name === n))).toEqual([]);
    });

    it("gives EVERY animated selector a reduced-motion substitute", () => {
      // The whole rule, mechanically. Add motion here freely; you may not add
      // it without saying what a visitor who asked for less gets instead.
      // Set MEMBERSHIP, not `reduced.includes(sel)`. A substring test passes
      // any selector that happens to be a prefix of a guarded one, which is
      // every figure ROOT on this page: `.ops-trace` is inside
      // `.ops-trace__node`, `.ops-cadence` inside `.ops-cadence__bar`,
      // `.ops-web` inside `.ops-web__svg`. Animating a root — the likeliest
      // next edit here — was silently exempt from the entire rule.
      expect(applied.length, "the animated rules went missing from the slice").toBeGreaterThan(0);
      const unguarded = [...new Set(applied.map((a) => a.selector))].filter((sel) => !guarded.has(sel));
      expect(unguarded, "animated on /ops with no prefers-reduced-motion rule").toEqual([]);
    });

    it("never lets a substitute be a bare `animation: none`", () => {
      // `animation: none` alone leaves an element that was carrying
      // information carrying nothing — a blank ring where a value used to be.
      // Every guarded rule must also restore a final state or a static mark.
      const bare = [...reduced.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /animation\s*:\s*none/.test(body))
        .filter(([, , body]) => body.replace(/animation\s*:\s*none\s*;?/, "").trim() === "")
        .flatMap(([, sel]) => selectorsOf(sel));
      expect(bare, "say what the visitor gets instead, don't just switch it off").toEqual([]);
    });

    it("never parks an instrument at a blank base state", () => {
      /* Render the final value and let JS un-do it — AnimatedMetric.tsx's
         pattern, and the one this board follows. The blank state belongs in JS
         because JS can read the reduced-motion query and simply not arm;
         a blank state in CSS needs a second rule to take it back, and the rule
         someone forgets to write is the one that ships.
     
         `transform: scale*(0)` counts, and did not before — which is a hole the
         size of this whole change, because scaleY(0) is exactly how the cadence
         bars are armed. The check knew `opacity: 0` and `stroke-dashoffset`,
         i.e. the two mechanisms already in the file, and was blind to the third
         the moment it arrived.
     
         A selector gated on a `data-` attribute is exempt, because that is the
         ARMING, not the base state: only useArrival writes it, and only when
         the visitor has not asked for less. Exempt, but not unchecked — an
         armed blank must still appear verbatim in the reduced-motion block, or
         "JS never arms under reduced motion" is a promise rather than a
         guarantee. */
      const outside = keyframeBlocks(normal).reduce((acc, k) => acc.replace(k.full, ""), normal);
      const blanks = [...outside.matchAll(
        /([^{}]+)\{([^{}]*(?:opacity:\s*0\s*[;}]|stroke-dashoffset:\s*(?!0)[\d.]+|transform:\s*scale[XY]?\(\s*0)[^{}]*)\}/g,
      )].flatMap(([, sel]) => selectorsOf(sel));
      expect(
        blanks.filter((sel) => !sel.includes("[data-")),
        "the markup must ship the finished instrument",
      ).toEqual([]);
      expect(
        blanks.filter((sel) => sel.includes("[data-") && !guarded.has(sel)),
        "an armed blank state needs its own reduced-motion un-doing",
      ).toEqual([]);
    });

    it("reserves the only endless loop for BROKEN", () => {
      /* BOTH spellings of forever, because the old check only knew one.
         `animation: <name> … infinite` was matched by taking the FIRST name in
         the declaration and then scanning to the semicolon for `infinite` —
         which reads a composited list wrong in both directions: it names the
         wrong animation when the looping one is second, and it never sees
         `animation-iteration-count: infinite` at all. A rule spelt the longhand
         way, on a selector that already has a reduced-motion substitute, looped
         forever in a colour that is not the alarm and no test noticed. */
      const shorthand = [...opsCss.matchAll(/animation\s*:\s*([^;}]+)/g)]
        .flatMap((m) => m[1].split(","))
        .filter((part) => /\binfinite\b/.test(part))
        .map((part) => part.trim().split(/\s+/).find((tok) => defined.includes(tok)) ?? part.trim());
      const longhand = [...opsCss.matchAll(/\{([^{}]*)\}/g)]
        .map((m) => m[1])
        .filter((body) => /animation-iteration-count\s*:\s*infinite/.test(body))
        .map((body) => body.match(/animation-name\s*:\s*([\w-]+)/)?.[1] ?? "(unnamed loop)");
      expect([...new Set([...shorthand, ...longhand])], "only the BROKEN pulse may loop").toEqual([
        "ops-pulse",
      ]);
    });

    it("keeps the alarm colour out of every other animation", () => {
      /* ops-pulse itself animates OPACITY on an element whose colour is already
         --color-danger, so the token does not appear in its keyframe body and
         this list is empty today. The assertion is the one that can actually
         break: no OTHER keyframe in the slice may reach for the alarm colour,
         which is what makes "still red after the first second" mean BROKEN and
         nothing else. */
      const reds = keyframes
        .filter((k) => k.body.includes("--color-danger"))
        .map((k) => k.name)
        .filter((n) => n !== "ops-pulse");
      expect(reds, "--color-danger may animate in ops-pulse and nowhere else").toEqual([]);
    });

    it("gates the pulse on BROKEN at EVERY call site", () => {
      // Widened from "exactly one site": the count was never the point, the
      // gate is. A second site is fine as long as it is also a BROKEN check.
      const sites = board.split("\n").filter((l) => l.includes("ops-pulse"));
      expect(sites.length).toBeGreaterThan(0);
      for (const s of sites) expect(s, "ops-pulse used outside a BROKEN check").toContain("BROKEN");
    });

    it("gates the ticking clock on BROKEN too", () => {
      expect(board).toMatch(/worstState === "BROKEN" && worst\?\.sinceIso && <BrokenClock/);
    });

    it("never animates the grammar layer", () => {
      // 145 rows staggering in is 145 animations and a keyboard user waiting on
      // them. Motion belongs to the summary layer and stops there.
      const moved = [...opsCss.matchAll(/(\.ops-row[^{}]*)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /animation|transition/.test(body))
        .flatMap(([, sel]) => selectorsOf(sel));
      expect(moved, "a row may not animate").toEqual([]);
    });
  });

  describe("a collapsed block can never hide a failure", () => {
    /**
     * The long blocks — fleet, leverage, drift, the ledger — fold their rows
     * behind a <details>. That is only honest because of two facts that no
     * rendered snapshot can show, and that a later "tidier if they all just
     * collapse" edit would quietly destroy:
     *
     *   1. a block's disclosure opens itself when the block holds a BROKEN
     *      row, derived from the rows rather than passed in by a caller;
     *   2. every Block still receives its FULL row array, so the rail — built
     *      from `all` — really does already contain every non-OK row that a
     *      closed block holds.
     *
     * Break either one and a closed disclosure becomes somewhere a failure can
     * sit unseen, on the one page whose entire argument is that a failure
     * nobody noticed is the expensive kind.
     */
    const board = readFileSync(join(root, "src", "OpsBoard.tsx"), "utf8");

    it("derives the disclosure's open state from a BROKEN check", () => {
      const open = /<details[^>]*\sopen=\{([A-Za-z0-9_]+)\}/.exec(board);
      expect(open, "the collapsible block lost its open= derivation").toBeTruthy();
      const name = open![1];
      const decl = board
        .split("\n")
        .filter((l) => new RegExp(`\\b(?:const|let)\\s+${name}\\s*=`).test(l));
      expect(decl, `${name} drives the disclosure but is declared ${decl.length} times`).toHaveLength(1);
      expect(
        decl[0],
        "a block may open itself on a BROKEN row and on nothing else — a row count, a length, or a hard-coded false all hide a failure",
      ).toContain('"BROKEN"');
    });

    it("never hands a Block a filtered row array", () => {
      const given = [...board.matchAll(/\brows=\{([^}]*)\}/g)].map((m) => m[1]);
      expect(given.length, "the Block call sites went missing").toBeGreaterThanOrEqual(8);
      const narrowed = given.filter((p) => /\.(filter|slice|splice)\(/.test(p));
      expect(
        narrowed,
        "a Block was given a subset of its rows: its census would then read clean while the rail counted the rest",
      ).toEqual([]);
    });

    it("builds the rail from every row on the board", () => {
      expect(
        board,
        "the rail must be filtered out of the WHOLE board, or a collapsed block can hold a non-OK row that is nowhere else on the page",
      ).toMatch(/const escalated = \[\.\.\.all\]\.filter\(\(m\) => m\.state !== "OK"\)/);
    });
  });

  describe("a build machine without the sibling repos keeps the committed board", () => {
    /**
     * gen-ops.mjs scans the KMP repos next to this one, which a CI runner does
     * not have. It is written to keep the committed rows in that case — but the
     * recovery regex has to match the shape the writer actually emits, and it
     * did not: it read `= [...] as const;` while drift is written as
     * `export const drift: Drift[] = [...];`, so every CI build would have
     * shipped an empty Vendored Drift block. A silently-emptied board, on a
     * page about silent emptying.
     */
    const gen = readFileSync(join(root, "scripts", "gen-ops.mjs"), "utf8");
    const emitted = readFileSync(join(root, "src", "data", "ops.ts"), "utf8");

    it("can recover the committed leverage rows from the emitted file", () => {
      const re = /const m = \/(export const leverage[^/]+)\//.exec(gen);
      expect(re, "the leverage recovery regex went missing").toBeTruthy();
      expect(new RegExp(re![1]).test(emitted), "recovery regex no longer matches what is written").toBe(true);
    });

    it("can recover the committed drift rows from the emitted file", () => {
      const re = /const m = \/(export const drift[^/]+)\//.exec(gen);
      expect(re, "the drift recovery regex went missing").toBeTruthy();
      expect(new RegExp(re![1]).test(emitted), "recovery regex no longer matches what is written").toBe(true);
    });
  });

  describe("the three states", () => {
    it("calls a blown SLA BROKEN and a fresh file OK", () => {
      expect(stateForAge(46, 45)).toBe("BROKEN");
      expect(stateForAge(1, 45)).toBe("OK");
    });

    it("calls a file aging toward its deadline DEGRADED — the whole point", () => {
      // Passing, succeeding daily, and quietly wrong.
      expect(stateForAge(30, 45)).toBe("DEGRADED");
      expect(stateForAge(21, 21)).toBe("DEGRADED");
      expect(stateForAge(22, 21)).toBe("BROKEN");
    });
  });
});
