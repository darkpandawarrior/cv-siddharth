import { describe, it, expect } from "vitest";
import {
  planGenerated,
  planTwinGenerated,
  planFreshness,
  planOldNames,
  planArchive,
  isGeneratorOutput,
  generatorForOutput,
} from "./doctor.mjs";

// doctor.test.mjs exercises the five PURE planning functions only — no
// network, no git, no gh — per self-healing-spec.md#4's acceptance bar:
// each check yields its planned action (branch name or issue title) in dry
// run, a clean fixture yields none, and two runs of the same input yield the
// same plan (trivially true for a pure function, but asserted explicitly
// below so a future edit that sneaks in a side effect — a Date.now(), a
// random id — fails loudly).

describe("doctor: check:generated (site side)", () => {
  it("plans a branch when generators left drift", () => {
    const plan = planGenerated(["src/data/galleries.ts"]);
    expect(plan).toEqual({ check: "generated", branch: "bot/doctor-generated", detail: ["src/data/galleries.ts"] });
  });

  it("plans nothing on a clean run", () => {
    expect(planGenerated([])).toBeNull();
  });

  it("is idempotent: the same dirty set plans the same branch twice", () => {
    const a = planGenerated(["src/data/galleries.ts"]);
    const b = planGenerated(["src/data/galleries.ts"]);
    expect(a).toEqual(b);
  });
});

describe("doctor: check:generated (twin side)", () => {
  it("plans the twin branch when the twin drifted, token present", () => {
    const plan = planTwinGenerated(["src/main/kotlin/CvOpsData.kt"], true);
    expect(plan).toEqual({
      check: "generated-twin",
      branch: "bot/generated-sync",
      repo: "cv-siddharth-kmp",
      dryRunOnly: false,
      detail: ["src/main/kotlin/CvOpsData.kt"],
    });
  });

  it("downgrades to dry-run-only when TWIN_PR_TOKEN is absent, never fails", () => {
    const plan = planTwinGenerated(["src/main/kotlin/CvOpsData.kt"], false);
    expect(plan.dryRunOnly).toBe(true);
    expect(plan.branch).toBe("bot/generated-sync");
  });

  it("plans nothing when the twin has no drift", () => {
    expect(planTwinGenerated([], true)).toBeNull();
  });
});

describe("doctor: check:freshness", () => {
  it("escalates to an issue when the heal still leaves the file stale", () => {
    const plan = planFreshness("chess.ts", { regenerated: true, stillStale: true });
    expect(plan).toEqual({
      check: "freshness",
      title: "ops: chess.ts past SLA",
      detail: { regenerated: true, stillStale: true },
    });
  });

  it("plans a heal branch when regenerating fixed it", () => {
    const plan = planFreshness("chess.ts", { regenerated: true, stillStale: false });
    expect(plan.branch).toBe("bot/doctor-generated");
    expect(plan.title).toBeUndefined();
  });

  it("plans nothing for a file that was never stale", () => {
    expect(planFreshness("chess.ts", { regenerated: false, stillStale: false })).toBeNull();
  });
});

describe("doctor: check:old-names", () => {
  const hits = [
    { file: "src/data/galleries.ts", lineNo: 3, text: "// Mileway", name: "Mileway" },
    { file: "README.md", lineNo: 10, text: "The Mileway team", name: "Mileway" }, // old-name:allow — test fixture data, not a real hit
  ];
  const isGenerated = (f) => f === "src/data/galleries.ts";

  it("splits generated-output hits (regenerate) from hand-written hits (issue)", () => {
    const plans = planOldNames(hits, isGenerated);
    expect(plans).toEqual([
      { check: "old-names-generated", branch: "bot/doctor-old-names", detail: [hits[0]] },
      { check: "old-names", title: "old-names: hand-written old-name hit(s)", detail: ["README.md:10: Mileway"] },
    ]);
  });

  it("plans nothing on a clean scan", () => {
    expect(planOldNames([], isGenerated)).toEqual([]);
  });

  it("plans only the hand-written half when nothing hit a generated output", () => {
    const plans = planOldNames([hits[1]], isGenerated);
    expect(plans).toHaveLength(1);
    expect(plans[0].check).toBe("old-names");
  });
});

describe("doctor: archive review-by", () => {
  it("opens one issue per row past reviewBy, title carrying the id", () => {
    const rows = [
      { id: "world-v1", reviewBy: "2026-01-01" },
      { id: "still-fine", reviewBy: "2099-01-01" },
    ];
    const plans = planArchive(rows, "2026-09-25");
    expect(plans).toEqual([
      { check: "archive", title: "archive: world-v1 past review-by", detail: "ARCHIVE.md#world-v1 — reviewBy 2026-01-01, today 2026-09-25" },
    ]);
  });

  it("plans nothing when every row is still within review-by", () => {
    expect(planArchive([{ id: "x", reviewBy: "2099-01-01" }], "2026-09-25")).toEqual([]);
  });

  it("plans nothing on an empty registry (the real one, until P3-07)", () => {
    expect(planArchive([], "2026-09-25")).toEqual([]);
  });
});

describe("doctor: isGeneratorOutput / generatorForOutput", () => {
  it("recognizes a declared generator output", () => {
    expect(isGeneratorOutput("src/data/galleries.ts")).toBe(true);
    expect(generatorForOutput("src/data/galleries.ts")).toBe("gen-galleries.mjs");
  });

  it("does not recognize hand-written source as a generator output", () => {
    expect(isGeneratorOutput("src/App.tsx")).toBe(false);
    expect(generatorForOutput("src/App.tsx")).toBeNull();
  });

  it("matches a glob output (public/**/*.avif etc.)", () => {
    expect(isGeneratorOutput("public/hero/one.avif")).toBe(true);
  });
});
