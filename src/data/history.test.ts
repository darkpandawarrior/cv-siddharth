import { describe, it, expect } from "vitest";
import { historyMonths, historyFrom, historyTo, totalCommits } from "./history.ts";

// Relationships, not values — same house rule as timeline.test.ts: this grows
// with every real commit, so nothing here pins a number that will be false
// tomorrow.
describe("history", () => {
  it("covers a contiguous month range with no gaps", () => {
    expect(historyMonths.length).toBeGreaterThan(0);
    expect(historyMonths[0].ym).toBe(historyFrom);
    expect(historyMonths.at(-1)!.ym).toBe(historyTo);
    for (let i = 1; i < historyMonths.length; i++) {
      const [py, pm] = historyMonths[i - 1].ym.split("-").map(Number);
      const [y, m] = historyMonths[i].ym.split("-").map(Number);
      expect(y * 12 + m).toBe(py * 12 + pm + 1);
    }
  });

  it("never counts a negative commit, line or file", () => {
    for (const m of historyMonths) {
      expect(m.commits).toBeGreaterThanOrEqual(0);
      expect(m.insertions).toBeGreaterThanOrEqual(0);
      expect(m.deletions).toBeGreaterThanOrEqual(0);
      expect(m.filesChanged).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps cumulative commits monotonically non-decreasing and ending at the total", () => {
    let prev = 0;
    for (const m of historyMonths) {
      expect(m.cumulative.commits).toBeGreaterThanOrEqual(prev);
      prev = m.cumulative.commits;
    }
    expect(historyMonths.at(-1)!.cumulative.commits).toBe(totalCommits);
  });

  it("caps notable subjects per month so a busy month can't become a full changelog", () => {
    for (const m of historyMonths) expect(m.subjects.length).toBeLessThanOrEqual(6);
  });
});
