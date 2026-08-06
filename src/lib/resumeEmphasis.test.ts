import { describe, expect, it } from "vitest";
import { emphasise } from "./resumeEmphasis.tsx";

/** Flatten the returned nodes into "plain" / "**bold**" markers for assertions. */
function render(text: string): string {
  return emphasise(text)
    .map((n) => (typeof n === "string" ? n : `**${(n as { props: { children: string } }).props.children}**`))
    .join("");
}

describe("emphasise", () => {
  it("never drops or reorders any character of the input", () => {
    // The whole function is a pass-through with markup — if it ever loses text,
    // a bullet silently ships with words missing.
    for (const s of [
      "Reduced production crashes 80% at 22,000+ daily users.",
      "a ~964k-LOC Kotlin app serving 50,000+ MAU",
      "from 1.6★ across 67 reviews to 4.5★ across 27,300",
      "no digits here at all",
      "",
    ]) {
      expect(render(s).replace(/\*\*/g, "")).toBe(s);
    }
  });

  it("bolds measured values", () => {
    expect(render("crashes 80% at 22,000+ users")).toContain("**80%**");
    expect(render("~87% of the UI layer")).toContain("**~87%**");
    expect(render("150+ clients ship")).toContain("**150+**");
  });

  it("leaves prose without numbers untouched", () => {
    expect(render("Set the module architecture")).toBe("Set the module architecture");
  });
});
