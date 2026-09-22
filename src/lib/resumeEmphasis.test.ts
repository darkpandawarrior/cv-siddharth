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

  // Both of these shipped to a PDF before anyone read the rendered page rather
  // than the source, which is why they are pinned here.
  it("does not split an identifier that happens to end in digits", () => {
    // Printed as "AES-**256**" and "5 SHA-**256** pins". Bolding half a cipher
    // name reads as a typo and steals the eye from the real metrics.
    expect(render("AES-256 Android Keystore")).toBe("AES-256 Android Keystore");
    expect(render("SSL pinning across 9 domains (5 SHA-256 pins)")).not.toContain("**256**");
    // A bare single digit was never bolded (it needs a unit or 2+ chars, see the
    // guard in emphasise), so "9 domains" staying plain is correct, not a
    // regression from the lookbehinds. A real multi-digit metric still bolds:
    expect(render("including all 24 hand-written schema migrations")).toContain("**24**");
  });

  it("does not bold a platform or tool version", () => {
    // Context, not achievement. These competed with 80% and 50,000+ MAU.
    expect(render("handling Android 12+ foreground-service-type rules")).not.toContain("**12+**");
    expect(render("drove the AGP 9 upgrade")).not.toContain("**9**");
    expect(render("Jetpack Compose and Material 3")).toBe("Jetpack Compose and Material 3");
  });
});
