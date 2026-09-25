// Deliberately fence-breaking — streamFence.test.ts's break-it fixture
// (G15). Never imported by real code: an ambient (claim:false) module is
// never supposed to reach for the ledger or a "live" status colour, and
// this file does both so the test can prove its checker fires.
import { ledger } from "../../ledger.ts";

export const AMBER_GLOW = "amber-400";

export function describeAmbient(): string {
  return `${ledger.generatedAt} ${AMBER_GLOW}`;
}
