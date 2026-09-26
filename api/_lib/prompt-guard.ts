/**
 * Behaviour-preserving re-export. The pure fence functions moved to
 * src/lib/promptFence.ts (idea-atlas SYS-9) so GuardLab.tsx can import and
 * run the SAME function in the browser instead of a copy. This file stays
 * as the edge handler's import path (chat-handler.ts:7) and everything
 * prompt-guard.test.ts asserts still holds; see that file, unchanged.
 */
export * from "../../src/lib/promptFence.js";
