import { describe, it, expect } from "vitest";
import { pickOutcomeMetric, excludeOutcomeScreenshot } from "./caseSpine";

describe("pickOutcomeMetric", () => {
  it("returns the metrics[] entry at outcomeMetricIndex", () => {
    const metrics = [{ value: "50%→95%", label: "GPS accuracy" }, { value: "80%", label: "crash reduction" }];
    expect(pickOutcomeMetric({ outcomeMetricIndex: 1, metrics })).toEqual(metrics[1]);
  });

  it("returns undefined when outcomeMetricIndex is not set", () => {
    expect(pickOutcomeMetric({ metrics: [{ value: "1", label: "x" }] })).toBeUndefined();
  });

  it("returns undefined when the index is out of range rather than throwing", () => {
    expect(pickOutcomeMetric({ outcomeMetricIndex: 5, metrics: [{ value: "1", label: "x" }] })).toBeUndefined();
  });

  it("returns undefined when there is no metrics array at all", () => {
    expect(pickOutcomeMetric({ outcomeMetricIndex: 0 })).toBeUndefined();
  });
});

describe("excludeOutcomeScreenshot", () => {
  it("drops the outcome screenshot from the marquee list", () => {
    const srcs = ["/a.png", "/b.png", "/c.png"];
    expect(excludeOutcomeScreenshot(srcs, "/b.png")).toEqual(["/a.png", "/c.png"]);
  });

  it("leaves the list untouched when there is no outcome screenshot", () => {
    const srcs = ["/a.png", "/b.png"];
    expect(excludeOutcomeScreenshot(srcs, undefined)).toEqual(srcs);
  });

  it("leaves the list untouched when the outcome screenshot isn't in it", () => {
    const srcs = ["/a.png", "/b.png"];
    expect(excludeOutcomeScreenshot(srcs, "/not-there.png")).toEqual(srcs);
  });
});
