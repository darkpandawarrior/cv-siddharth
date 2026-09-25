// PaymentsLab-KMP's five money-movement rails plus split payments, all
// branching from one PaymentGateway contract — see idea-atlas.md#REC-2 and
// projects.ts's own "Five money-movement rails + split payments" section for
// the full prose. Static, hand-authored: unlike providers.ts this has no
// sibling checkout to regenerate from, the rail set itself only changes when
// a new rail ships in the app, same cadence as that prose section.

export interface Rail {
  id: string;
  label: string;
  route: string | null;
  description: string;
}

export const RAILS: Rail[] = [
  { id: "payouts", label: "Payouts", route: "/payouts", description: "Money out to a beneficiary." },
  { id: "mandates", label: "Mandates & subscriptions", route: "/mandates", description: "Scheduled debits, plus cancel." },
  { id: "vault", label: "Card vault", route: "/vault", description: "Tokenize once, charge later by id." },
  { id: "connect", label: "Marketplace Connect", route: "/connect", description: "Sub-merchant KYC and split payouts." },
  { id: "wallet", label: "Wallet ledger", route: "/wallet", description: "Seed, debit or refund against a real running balance." },
  { id: "split", label: "Split payments", route: null, description: "A two-leg orchestration that compensates if one leg fails." },
];

/** Mermaid flowchart source: one PaymentGateway contract branching into the
 *  five rails, split payments drawn off the two rails it actually
 *  orchestrates (payouts + wallet), matching the case study's own prose. */
export const RAILS_MERMAID = [
  "graph LR",
  '  PG["PaymentGateway contract"]',
  ...RAILS.filter((r) => r.id !== "split").map(
    (r) => `  PG --> ${r.id}["${r.label}${r.route ? ` (${r.route})` : ""}"]`,
  ),
  '  payouts --> split["Split payments"]',
  "  wallet --> split",
].join("\n");
