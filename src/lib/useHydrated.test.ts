import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("useHydrated", () => {
  it("never becomes the way to read a browser capability", () => {
    // The hook answers one question, "am I on the client yet". A capability
    // probe (WebGL, a media query) has a value that matters and can change,
    // and useSyncExternalStore with a constant snapshot would freeze it. This
    // pins the hook's own body so that meaning cannot quietly widen.
    const src = readFileSync(new URL("./useHydrated.ts", import.meta.url), "utf8");
    // Comments stripped first: the doc comment names WebGL and media queries
    // precisely to say this hook is NOT for them, so matching the raw file
    // would fail on its own warning.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/matchMedia|WebGL|navigator\.|localStorage/);
    expect(code).toContain("useSyncExternalStore");
  });

  it("is what the mount-flag components use, so the idiom stays in one place", () => {
    const users = [
      "../play/ReactionRow.tsx",
      "../play/MarginNotes.tsx",
      "../play/DeferredPlayRoom.tsx",
    ];
    for (const u of users) {
      const src = readFileSync(new URL(u, import.meta.url), "utf8");
      expect(src, `${u} should use useHydrated`).toContain("useHydrated");
      expect(src, `${u} still hand-rolls the mount flag`).not.toMatch(
        /useEffect\(\(\)\s*=>\s*setMounted\(true\)/,
      );
    }
  });
});
