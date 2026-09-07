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

  it("ReactionRow, MarginNotes and DeferredPlayRoom use <ClientOnly>, not a hand-rolled hydration check", () => {
    // All three exist to keep @playhtml/react off routes that server-render
    // (ink.tsx, weeb.tsx, anthology.tsx, read.$slug.tsx), and all three used
    // to gate that with `useHydrated()` + lazy(). That stops the runtime crash
    // but not importProtection's static scan: React still resolves a lazy
    // child while streaming on the server, so the scan still finds
    // @playhtml/react through the dynamic import target regardless of the
    // runtime check (reproduced while building this lane). <ClientOnly> is
    // recognised by Start's own compiler (config.js registers it as the
    // ClientOnlyJSX kind), which strips its children from the SERVER compile
    // before the SSR bundle is built, dead-code-eliminating the lazy import
    // along with them — the idiom this file now pins in one place.
    const users = ["../play/ReactionRow.tsx", "../play/MarginNotes.tsx", "../play/DeferredPlayRoom.tsx"];
    for (const u of users) {
      const src = readFileSync(new URL(u, import.meta.url), "utf8");
      // Comments stripped first: each file's own doc comment explains why it
      // moved OFF useHydrated by name, which would fail this assertion on its
      // own explanation otherwise.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, `${u} should use ClientOnly`).toContain("ClientOnly");
      expect(code, `${u} should not fall back to a hand-rolled hydration check`).not.toContain("useHydrated");
      expect(code, `${u} still hand-rolls the mount flag`).not.toMatch(
        /useEffect\(\(\)\s*=>\s*setMounted\(true\)/,
      );
    }
  });
});
