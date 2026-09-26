/**
 * The doctrine wall (idea-atlas CRAFT-4, lane I6/P2-14): four laws, each one
 * carried over from a real repo he shipped, each enforced on THIS site by a
 * named test that has already been proven to fail (doctrine.test.ts).
 *
 * One row per law: the repo it came from, and the one in-repo test that
 * enforces it here. `alsoCites` is a second, non-test citation named in the
 * spec prose (idea-atlas critic C1) that doctrine.test.ts does not
 * mechanically re-check, because it names a data ledger rather than a test.
 *
 * This file itself is checked by a grep for the private harness's own name,
 * so it never names it, names an internal tool, or prints a home-directory
 * path (trove-map D1) - doctrine.test.ts enforces that mechanically.
 */
export interface DoctrineLaw {
  id: string;
  law: string;
  cameFrom: string;
  testFile: string;
  testName: string;
  alsoCites?: string;
}

export const DOCTRINE_LAWS: readonly DoctrineLaw[] = [
  {
    id: "success-is-a-hint",
    law: "A client-side success is a hint, never proof",
    cameFrom: "PaymentsLab-KMP",
    testFile: "api/_lib/signals-handler.test.ts",
    testName: "returns the exact SignalsResponse shape from a fully live fixture set",
  },
  {
    id: "filtered-not-deleted",
    law: "Filtered never means deleted",
    cameFrom: "Doori (GPS provenance)",
    testFile: "src/EvidenceChip.test.ts",
    testName: "renders the hollow ring when the caller flags a value plausibility.ts rejected (tempC 60)",
  },
  {
    id: "trust-the-tape",
    law: "Trust the tape, not the testimony",
    cameFrom: "Stutter (public README)",
    testFile: "e2e/reality-footer.spec.ts",
    testName: "footer weather chip reads 'Pune 22.9 °C, overcast, AQI 77'",
  },
  {
    id: "every-check-can-fail",
    law: "Every check must be able to fail",
    cameFrom: "the harness doctrine, stated generically",
    testFile: "src/world/v2/fictionFence.test.ts",
    testName: "flags the banned imports in the fixture, both directions",
    alsoCites:
      "src/data/incidents.ts: 11 production incidents a green check did not catch, each with a real day-count to a fix, dot-plotted above.",
  },
];
