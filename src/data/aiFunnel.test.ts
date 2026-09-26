import { describe, it, expect } from "vitest";
import * as chatHandler from "../../api/_lib/chat-handler.ts";
import * as promptGuard from "../../api/_lib/prompt-guard.ts";
import { AI_FUNNEL_STAGES, mermaidFromAiFunnel, type AiFunnelStage } from "./aiFunnel";

const MODULES: Record<string, Record<string, unknown>> = {
  "api/_lib/chat-handler.ts": chatHandler as unknown as Record<string, unknown>,
  "api/_lib/prompt-guard.ts": promptGuard as unknown as Record<string, unknown>,
};

/** Every stage whose named symbol is missing from the file it claims to live
 *  in. Empty means the diagram matches the code: this is the check
 *  idea-atlas SYS-8 asks for, run against real imports rather than a regex
 *  over source text, so a re-export (prompt-guard.ts now re-exports from
 *  promptFence.ts) is verified the same way a direct export is. */
function missingSymbols(stages: AiFunnelStage[]): string[] {
  return stages
    .filter((stage) => typeof MODULES[stage.file]?.[stage.symbol] === "undefined")
    .map((stage) => `${stage.file}#${stage.symbol}`);
}

describe("AI_FUNNEL_STAGES", () => {
  it("names only symbols that are real exports of the file it claims", () => {
    expect(missingSymbols(AI_FUNNEL_STAGES)).toEqual([]);
  });

  it("covers every stage the SYS-8 depth plan names", () => {
    const ids = AI_FUNNEL_STAGES.map((s) => s.id);
    expect(ids).toEqual([
      "cors",
      "rate-limit",
      "estimate-tokens",
      "pick-providers",
      "prompt-guard",
      "provider-fallback",
      "stream",
    ]);
  });

  it("never names a private tier or routing config term", () => {
    const text = AI_FUNNEL_STAGES.map((s) => `${s.label} ${s.detail}`).join(" ").toLowerCase();
    for (const leak of ["candidai", "tier-router", "router config"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("break-it: fails on a fixture whose symbol was removed from its file", () => {
    const lastReal = AI_FUNNEL_STAGES.at(-1)!;
    const broken: AiFunnelStage[] = [...AI_FUNNEL_STAGES.slice(0, -1), { ...lastReal, symbol: "thisSymbolDoesNotExist_v2" }];
    expect(missingSymbols(broken)).toEqual([`${lastReal.file}#thisSymbolDoesNotExist_v2`]);
  });

  it("break-it: also fails when a stage claims a file the checker has never loaded", () => {
    const broken: AiFunnelStage[] = [{ id: "ghost", label: "Ghost", symbol: "anything", file: "api/_lib/nonexistent.ts", detail: "" }];
    expect(missingSymbols(broken)).toEqual(["api/_lib/nonexistent.ts#anything"]);
  });
});

describe("mermaidFromAiFunnel", () => {
  it("chains every stage in order, deterministically", () => {
    const out = mermaidFromAiFunnel();
    expect(out).toBe(mermaidFromAiFunnel());
    expect(out.startsWith("graph LR")).toBe(true);
    for (const stage of AI_FUNNEL_STAGES) expect(out).toContain(`${stage.id}["${stage.label}"]`);
    expect(out).toContain("cors --> rate-limit");
    expect(out).toContain("provider-fallback --> stream");
  });
});
