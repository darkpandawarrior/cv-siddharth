import { describe, expect, it } from "vitest";
import { projects } from "./data/profile.ts";
import { resourceRows, uniqueResources } from "./data/resourceDirectory.ts";

describe("public resource directory", () => {
  it("connects every curated project without exposing private source or broken Pages roots", () => {
    const rows = resourceRows();
    expect(rows.slice(0, projects.length).map((row) => row.project.slug)).toEqual(projects.map((project) => project.slug));

    const resources = rows.flatMap((row) => row.resources);
    expect(resources.filter((item) => item.kind === "API docs").map((item) => item.url)).toEqual([
      "https://darkpandawarrior.github.io/kmp-build-logic/",
      "https://darkpandawarrior.github.io/kmp-toolkit/",
    ]);
    expect(resources.filter((item) => item.kind === "showcase")).toHaveLength(3);
    expect(resources.filter((item) => item.kind === "install")).toHaveLength(3);
    expect(resources.filter((item) => /github\.io\/(Doori|PaymentsLab-KMP)\//.test(item.url))).toHaveLength(2);
    expect(new Set(resources.filter(item => item.kind === "source").map(item => new URL(item.url).pathname.split("/")[2])).size).toBe(14);
    expect(rows.slice(projects.length).every(row => row.resources.every(item => item.kind === "source"))).toBe(true);

    for (const slug of ["candidai", "stutter"]) {
      expect(rows.find((row) => row.project.slug === slug)?.resources.some((item) => item.kind === "source")).toBe(false);
    }
  });
});


it("deduplicates equivalent resource URLs without merging different destinations", () => {
  const input = [
    { kind: "live demo" as const, label: "First", url: "https://example.com/demo/?b=2&a=1" },
    { kind: "live demo" as const, label: "Duplicate", url: "https://EXAMPLE.com/demo?a=1&b=2" },
    { kind: "showcase" as const, label: "Scene", url: "https://example.com/demo?a=1&b=2#scene" },
    { kind: "live demo" as const, label: "Other", url: "https://example.com/demo?a=2&b=2" },
  ];
  expect(uniqueResources(input).map(item => item.label)).toEqual(["First", "Scene", "Other"]);
  for (const row of resourceRows()) expect(uniqueResources(row.resources)).toEqual(row.resources);
});
