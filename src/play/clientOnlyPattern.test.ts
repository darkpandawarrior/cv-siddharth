import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("client-only-after-hydration pattern", () => {
  it("ReactionRow, MarginNotes and DeferredPlayRoom use <ClientOnly>, not a hand-rolled mounted-state check", () => {
    // All three exist to keep @playhtml/react off routes that server-render
    // (ink.tsx, weeb.tsx, anthology.tsx, read.$slug.tsx). React's dynamic-import code-splitting alone
    // does not stop the SSR bundler from resolving a client-only library's
    // import (reproduced while building the hydration-contract lane) — only
    // `<ClientOnly>` is recognised by Start's own compiler (config.js
    // registers it as the ClientOnlyJSX kind), which strips its children from
    // the SERVER compile before the SSR bundle is built. This used to be
    // pinned against a small "am I on the client yet" hook every one of these
    // had already stopped calling; that hook had zero real callers left (grep
    // confirmed it before deletion) and is gone, so the pin now just asserts
    // each file keeps the ClientOnly boundary.
    const users = ["../play/ReactionRow.tsx", "../play/MarginNotes.tsx", "../play/DeferredPlayRoom.tsx"];
    for (const u of users) {
      const src = readFileSync(new URL(u, import.meta.url), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, `${u} should use ClientOnly`).toContain("ClientOnly");
      expect(code, `${u} still hand-rolls a mounted-state flag`).not.toMatch(
        /useState\(false\)[\s\S]{0,80}useEffect\(\(\)\s*=>\s*set\w+\(true\)/,
      );
    }
  });
});
