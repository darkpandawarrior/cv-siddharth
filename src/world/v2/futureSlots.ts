/**
 * Future slots (living-ledger-spec §8.2): a surveyor's peg where a rule's
 * next record will land. Placement is deterministic — the z is exact
 * (`dateZ(now)` on that rule's own bank line) — only the lateral jitter of
 * the eventual real feature is unknown, so the peg carries no x.
 *
 * Driven entirely by which GRAMMAR rules declare a `nextSlot` (currently
 * G6/G7/G11/G12 — living-ledger §8.2's table) rather than a second,
 * separately-maintained list: a rule that never gets one never appears
 * here, with no drift possible between the two.
 */
import { GRAMMAR } from "./grammar.ts";
import type { Ledger } from "./ledger.ts";
import { dateZ } from "../city.ts";

export interface FuturePeg {
  ruleId: string;
  label: string;
  z: number;
}

export function futureSlots(ledger: Ledger, now: Date): FuturePeg[] {
  const iso = now.toISOString().slice(0, 10);
  const z = dateZ(iso) ?? 0;
  const pegs: FuturePeg[] = [];
  for (const rule of GRAMMAR) {
    if (!rule.nextSlot) continue;
    const slot = rule.nextSlot(ledger, now);
    if (slot === null) continue;
    pegs.push({ ruleId: rule.id, label: slot.label ?? "", z });
  }
  return pegs;
}
