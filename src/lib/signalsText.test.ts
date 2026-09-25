import { describe, it, expect } from "vitest";
import { ciRepoLabel, ciRow, chessRow, kitesRow, downloadsRow } from "./signalsText";
import type { SignalsResponse } from "../../api/_lib/signals-handler.ts";

const AT = "2026-09-24T03:28:00Z";

const CI_FIXTURE: NonNullable<SignalsResponse["ci"]> = {
  doori: { state: "pass", newestAt: AT, failing: [] },
  gaddi: { state: "pass", newestAt: AT, failing: [] },
  "paymentslab-kmp": { state: "fail", newestAt: AT, failing: ["Quality Gate"] },
  "kmp-toolkit": { state: "pass", newestAt: AT, failing: [] },
  "kmp-build-logic": { state: "none", newestAt: null, failing: [] },
};

describe("ciRepoLabel", () => {
  it("formats a failing repo as 'paymentslab-kmp ✗ (Quality Gate)'", () => {
    expect(ciRepoLabel("paymentslab-kmp", CI_FIXTURE)).toBe("paymentslab-kmp ✗ (Quality Gate)");
  });

  it("formats a private registry repo as 'private, not polled', never fetched", () => {
    expect(ciRepoLabel("candidai", null)).toBe("private, not polled");
    expect(ciRepoLabel("stutter", CI_FIXTURE)).toBe("private, not polled");
  });

  it("formats a passing repo with a check and a never-run repo as unmeasured", () => {
    expect(ciRepoLabel("doori", CI_FIXTURE)).toBe("doori ✓");
    expect(ciRepoLabel("kmp-build-logic", CI_FIXTURE)).toBe("kmp-build-logic unmeasured");
  });

  it("no em dash in any label", () => {
    for (const slug of ["doori", "paymentslab-kmp", "kmp-build-logic", "candidai"]) {
      expect(ciRepoLabel(slug, CI_FIXTURE)).not.toContain("—");
    }
  });
});

describe("ciRow", () => {
  it("joins every repo token and falls back when ci is null", () => {
    const row = ciRow(CI_FIXTURE, AT);
    expect(row).toContain("doori ✓");
    expect(row).toContain("paymentslab-kmp ✗ (Quality Gate)");
    expect(row).toContain("GitHub Actions, main");
    expect(ciRow(null, AT)).toBe("CI · unavailable right now · GitHub Actions, main");
  });
});

describe("chessRow", () => {
  it("reads 'not playing' when offline, no em dash", () => {
    const row = chessRow({ online: false, playing: false }, AT);
    expect(row).toContain("lichess: not playing");
    expect(row).not.toContain("—");
  });

  it("reads 'playing now' when playing", () => {
    expect(chessRow({ online: true, playing: true }, AT)).toContain("playing now");
  });

  it("falls back when lichess is null", () => {
    expect(chessRow(null, AT)).toBe("Chess · unavailable right now · lichess.org");
  });
});

describe("kitesRow", () => {
  it("sums reactions and comments across articles", () => {
    const devto: SignalsResponse["devto"] = [
      { url: "https://dev.to/a", reactions: 1, comments: 0, publishedAt: AT },
      { url: "https://dev.to/b", reactions: 0, comments: 0, publishedAt: AT },
    ];
    const row = kitesRow(devto, 17, AT);
    expect(row).toContain("2 of 17 lessons on dev.to");
    expect(row).toContain("1 reaction or comment in total");
  });

  it("falls back when devto is null", () => {
    expect(kitesRow(null, 17, AT)).toBe("Kites · unavailable right now · dev.to");
  });
});

describe("downloadsRow", () => {
  it("lists apk counts per repo and credits GitHub Releases", () => {
    const downloads: SignalsResponse["downloads"] = {
      doori: { tag: "v1.0", apk: 22 },
      gaddi: { tag: "v1.0", apk: 21 },
      "paymentslab-kmp": { tag: "v1.0", apk: 22 },
    };
    const row = downloadsRow(downloads);
    expect(row).toContain("doori 22");
    expect(row).toContain("gaddi 21");
    expect(row).toContain("paymentslab-kmp 22");
    expect(row).toContain("F-Droid keeps no download count");
  });

  it("falls back when downloads is null", () => {
    expect(downloadsRow(null)).toBe("Downloads · unavailable right now · GitHub Releases");
  });
});
