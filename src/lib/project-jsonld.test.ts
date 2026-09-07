import { describe, it, expect } from "vitest";
import { buildProjectJsonLd } from "./project-jsonld";
import { projects } from "../data/profile";

const doori = projects.find((p) => p.slug === "doori")!;
const stutter = projects.find((p) => p.slug === "stutter")!;

describe("buildProjectJsonLd", () => {
  it("builds a SoftwareSourceCode block with language + repo when present", () => {
    const { softwareSourceCode } = buildProjectJsonLd(doori);
    expect(softwareSourceCode).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "Doori",
      url: "https://cv-siddharth.vercel.app/project/doori",
      programmingLanguage: ["Kotlin"],
      codeRepository: "https://github.com/darkpandawarrior/Doori",
      author: { "@type": "Person", name: "Siddharth Pandalai" },
    });
  });

  it("omits codeRepository when the project has no repo link (private repo)", () => {
    const { softwareSourceCode } = buildProjectJsonLd(stutter);
    expect(softwareSourceCode).not.toHaveProperty("codeRepository");
    expect(softwareSourceCode.programmingLanguage).toEqual(["GDScript"]);
  });

  it("does not tag a JavaScript stack as also using Java (word-boundary match)", () => {
    const fake = { ...doori, slug: "x", name: "X", stack: ["JavaScript", "React"], links: [] };
    const { softwareSourceCode } = buildProjectJsonLd(fake);
    expect(softwareSourceCode.programmingLanguage).toEqual(["JavaScript"]);
  });

  it("builds a valid 3-level BreadcrumbList ending at the project", () => {
    const { breadcrumbList } = buildProjectJsonLd(doori);
    expect(breadcrumbList["@type"]).toBe("BreadcrumbList");
    expect(breadcrumbList.itemListElement).toHaveLength(3);
    expect(breadcrumbList.itemListElement.at(-1)).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Doori",
      item: "https://cv-siddharth.vercel.app/project/doori",
    });
  });
});
