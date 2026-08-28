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

  describe("only BROKEN moves", () => {
    /**
     * The spec's motion rule, proved mechanically rather than by eye — the way
     * the perimeter was proved. One animated selector, and its only call site
     * is gated on BROKEN.
     */
    it("gates the pulse on BROKEN at its single call site", () => {
      const board = readFileSync(join(root, "src", "OpsBoard.tsx"), "utf8");
      const sites = board.split("\n").filter((l) => l.includes("ops-pulse"));
      expect(sites).toHaveLength(1);
      expect(sites[0]).toContain("BROKEN");
    });

    it("gates the ticking clock on BROKEN too", () => {
      const board = readFileSync(join(root, "src", "OpsBoard.tsx"), "utf8");
      expect(board).toMatch(/worstState === "BROKEN" && worst\?\.sinceIso && <BrokenClock/);
    });

    it("defines exactly one keyframes animation for the board", () => {
      const css = readFileSync(join(root, "src", "index.css"), "utf8");
      const opsCss = css.slice(css.indexOf("/* /ops — the board's grammar"));
      expect((opsCss.match(/@keyframes/g) ?? []).length).toBe(1);
    });

    it("still honours prefers-reduced-motion", () => {
      const css = readFileSync(join(root, "src", "index.css"), "utf8");
      const opsCss = css.slice(css.indexOf("/* /ops — the board's grammar"));
      expect(opsCss).toContain("prefers-reduced-motion");
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
