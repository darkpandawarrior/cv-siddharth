import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findHits, trackedFiles, scan } from "./check-old-names.mjs";

const root = new URL("../", import.meta.url).pathname;

// This file's job is to contain the fixtures the acceptance bar names —
// "exits 0 on the merged tree, exits 1 on a fixture containing 'Mileway'" —
// so it is one of the two files check-old-names.mjs itself exempts from the
// scan (the other is the scanner's own source, for the same reason).

describe("check-old-names", () => {
  describe("the five old names, unadorned", () => {
    it.each([
      ["The Mileway team shipped this."],
      ["Kursi's ISMCTS engine runs client-side."],
      ["HireSignal fans out to every provider."],
      ["The DEADLOCK replay gate blocked the merge."],
      ["PaymentsLab handles five money rails."],
    ])("flags a bare mention: %s", (line) => {
      expect(findHits("src/x.ts", line)).toHaveLength(1);
    });

    it("does not flag PaymentsLab-KMP, the current name", () => {
      expect(findHits("src/x.ts", "PaymentsLab-KMP handles five money rails.")).toHaveLength(0);
    });

    it("does not flag the lowercase CS term deadlock", () => {
      expect(findHits("src/x.ts", "a deadlock between two locks")).toHaveLength(0);
    });

    it("does not flag title-case Deadlock — only the all-caps product name is in scope", () => {
      // A human swept every title-case PRODUCT mention by hand before this
      // landed; the scanner's five patterns only cover all-caps DEADLOCK, so
      // it cannot regress on the CS term either way.
      expect(findHits("src/x.ts", "A Deadlock at the start of a sentence.")).toHaveLength(0);
    });
  });

  describe("the KEEP classes", () => {
    it("allows a rename-record sentence, old name first", () => {
      expect(findHits("README.md", "Doori (formerly Mileway) ships five platforms.")).toHaveLength(0);
    });

    it("allows a rename-record sentence, new name first", () => {
      expect(findHits("src/x.ts", "// Mileway (now Doori) shipped V24.")).toHaveLength(0);
    });

    it("allows the comma-joined rename-record form", () => {
      expect(findHits("src/x.ts", '* how "MILEWAY" (Mileway, now Doori) got printed.')).toHaveLength(0);
    });

    it("allows a quoted local checkout path", () => {
      expect(findHits("scripts/gen-ops.mjs", '  ["Doori", join(ANDROID, "Mileway")],')).toHaveLength(0);
    });

    it("allows a slash-bounded local checkout path", () => {
      expect(findHits(".github/workflows/refresh-media.yml", "          mv x ../../Android/Mileway")).toHaveLength(0);
    });

    it("allows a backtick-quoted local path in prose", () => {
      expect(findHits("docs/x.md", "Steps, from `Android/HireSignal`:")).toHaveLength(0);
    });

    it("allows a vercel.json redirect source line, even with the old name unquoted on it", () => {
      // Chosen so the old name is NOT also quote/slash-bounded, isolating the
      // vercel.json + "source": rule from the general local-path boundary
      // check below (real redirect sources are always quoted anyway, so in
      // practice both rules agree — this just proves the dedicated rule
      // fires on its own).
      expect(findHits("vercel.json", '  "source": "/x", // kept for Mileway compatibility')).toHaveLength(0);
    });

    it("does not exempt a vercel.json line with no source key", () => {
      expect(findHits("vercel.json", "  // kept for Mileway compatibility")).toHaveLength(1);
    });

    it("does not exempt an old name in some OTHER file just because it mentions source:", () => {
      // The vercel.json exemption is keyed on the FILE, not the string shape.
      expect(findHits("src/x.ts", '  "source": "/x", // kept for Mileway compatibility')).toHaveLength(1);
    });

    it("allows a claim-audit:allow marker", () => {
      expect(findHits("src/x.ts", "// Mileway shipped V24. <!-- claim-audit:allow -->")).toHaveLength(0);
    });

    it("allows the scanner's own pattern source, wherever it is quoted", () => {
      expect(
        findHits("e2e/x.spec.ts", "const oldNames = /Mileway|Kursi|HireSignal|DEADLOCK|PaymentsLab(?!-KMP)/;"),
      ).toHaveLength(0);
    });
  });

  describe("whole-file exemptions", () => {
    it("exempts src/data/history.ts, which quotes real commit subjects verbatim", () => {
      // history.ts genuinely still contains "Mileway" in a committed subject
      // line — that is the point of the exemption, not a fixture standing in
      // for it.
      expect(scan(["src/data/history.ts"])).toEqual([]);
    });

    it("exempts its own two files (pattern source and fixtures)", () => {
      expect(scan(["scripts/check-old-names.mjs", "scripts/check-old-names.test.mjs"])).toEqual([]);
    });
  });

  describe("scope", () => {
    it("only scans git-tracked files, and the repo has plenty", () => {
      expect(trackedFiles().length).toBeGreaterThan(100);
    });

    it("skips a compiled heavy/*-app bundle", () => {
      expect(findHits("heavy/gaddi-app/cmp-web.js", "Kursi")).toHaveLength(1); // findHits alone doesn't know the path rule
      expect(scan(["heavy/gaddi-app/cmp-web.js"])).toEqual([]); // scan() applies the compiled-bundle skip before findHits ever runs
    });

    it("skips a non-text extension entirely", () => {
      expect(scan(["public/favicon.ico"])).toEqual([]);
    });
  });

  describe("the real repo, end to end", () => {
    const run = (args = []) =>
      execFileSync("node", ["scripts/check-old-names.mjs", ...args], { cwd: root, encoding: "utf8" });

    it("exits 0 on the merged tree", () => {
      expect(() => run()).not.toThrow();
    });

    it("exits 1 on a fixture containing 'Mileway'", () => {
      const dir = mkdtempSync(join(tmpdir(), "check-old-names-"));
      const fixture = join(dir, "fixture.ts");
      writeFileSync(fixture, "export const x = 'Mileway';\n");
      try {
        expect(() => run([fixture])).toThrow();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
