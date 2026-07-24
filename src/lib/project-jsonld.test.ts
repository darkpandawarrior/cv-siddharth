import { describe, it, expect } from "vitest";
import { buildProjectJsonLd } from "./project-jsonld";
import { projects } from "../data/profile";

const mileway = projects.find((p) => p.slug === "mileway")!;
const deadlock = projects.find((p) => p.slug === "deadlock")!;

describe("buildProjectJsonLd", () => {
  it("builds a SoftwareSourceCode block with language + repo when present", () => {
    const { softwareSourceCode } = buildProjectJsonLd(mileway);
    expect(softwareSourceCode).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "Mileway",
      url: "https://cv-siddharth.vercel.app/project/mileway",
      programmingLanguage: ["Kotlin"],
      codeRepository: "https://github.com/darkpandawarrior/Mileway",
      author: { "@type": "Person", name: "Siddharth Pandalai" },
    });
  });

  it("omits codeRepository when the project has no repo link (private repo)", () => {
    const { softwareSourceCode } = buildProjectJsonLd(deadlock);
    expect(softwareSourceCode).not.toHaveProperty("codeRepository");
    expect(softwareSourceCode.programmingLanguage).toEqual(["GDScript"]);
  });

  it("does not tag a JavaScript stack as also using Java (word-boundary match)", () => {
    const fake = { ...mileway, slug: "x", name: "X", stack: ["JavaScript", "React"], links: [] };
    const { softwareSourceCode } = buildProjectJsonLd(fake);
    expect(softwareSourceCode.programmingLanguage).toEqual(["JavaScript"]);
  });

  it("builds a valid 3-level BreadcrumbList ending at the project", () => {
    const { breadcrumbList } = buildProjectJsonLd(mileway);
    expect(breadcrumbList["@type"]).toBe("BreadcrumbList");
    expect(breadcrumbList.itemListElement).toHaveLength(3);
    expect(breadcrumbList.itemListElement.at(-1)).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Mileway",
      item: "https://cv-siddharth.vercel.app/project/mileway",
    });
  });
});
