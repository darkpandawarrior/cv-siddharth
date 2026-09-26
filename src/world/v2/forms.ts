/**
 * One form, one meaning (living-ledger-spec §3.4 D6, master-plan M16).
 *
 * Diyas, fireflies and lanterns each carried two conflicting meanings across
 * v1's specs (M1, M16) — the bug this file exists to stop from recurring.
 * `FORMS` is the single place a form id's meaning is declared; a grammar
 * rule (P2-03c) or a stream (this lane's streams.ts) binds one of these ids
 * and never invents a second meaning for it. `forms.test.ts` (P2-03c, once
 * GRAMMAR exists) checks no two GRAMMAR rules or STREAMS entries bind the
 * same form id at runtime.
 *
 * `FormId` stays an open string type (not a closed union): GRAMMAR's own
 * per-rule forms (a basalt stone, a kite mast, a district bench...) are
 * plain unique ids that don't need a governed meaning here — only the ones
 * that history has already collided on, plus the festival kit and the
 * river's ambient form (M16), get a row.
 */

// Kept as a plain string rather than a closed union: a later lane's
// grammar/stream form id is still a valid FormId without editing this file
// (this lane doesn't own forms.test.ts or grammar.ts).
export type FormId = string;

export interface FormMeaning {
  /** What is drawn for this form, in one clause. */
  meaning: string;
  /** false = ambient: never amber/cyan/green, never opens a detail panel
   *  (streamFence.test.ts, living-ledger-spec §4). */
  claim: boolean;
}

export const FORMS: Readonly<Record<string, FormMeaning>> = {
  "diya": { meaning: "a commit (live)", claim: true },
  "niche-lamp": { meaning: "a fleet listing", claim: true },
  "lantern": { meaning: "a visitor", claim: true },
  "garland": { meaning: "an artifact (ambient)", claim: false },
  "firefly": { meaning: "a weeb title", claim: true },
  "submerged-stone": { meaning: "an open PR (never counted with pr-stone)", claim: true },
  "festival:rangoli": { meaning: "festival decal (ambient)", claim: false },
  "festival:toran": { meaning: "festival mango-leaf toran (ambient)", claim: false },
  "festival:paper-kite": { meaning: "festival paper kite, paper tints, never amber (ambient)", claim: false },
  "festival:gudi": { meaning: "festival gudi (ambient)", claim: false },
  "ambient:geography": { meaning: "the Mula river itself, unclaimed geography (ambient)", claim: false },
};

/** True when `id` is one of the governed forms above and marked ambient. */
export function isClaimFalseForm(id: FormId): boolean {
  return FORMS[id]?.claim === false;
}
