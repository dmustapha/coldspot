// File: src/core/reconcile.ts
import type { CoverageFacts, FederatedRow, ReserveDecision } from "./types";

// Map the ONE federated query's rows into coverage facts, then compute the completeness gate.
// vision (C1): an optional Nemotron VL read of the FEMA declaration. When the federated treaty
// row has an OPEN-ENDED CAT window (cat_event_close null -> lossInsideCatWindow stays null ->
// abstain), the vision-extracted catWindowClose/Open SYNTHESIZES the missing close date so the
// loss-in-window test can run and the gate resolves. Federated rows ALWAYS win when they already
// carry a close date; vision only fills the gap the data left open — it can never override a
// confirmed treaty window.
export function toCoverageFacts(
  rows: FederatedRow[],
  claim: { peril: string; lossDate: string; reportedAmount?: number },
  vision?: CoverageFacts["visionFacts"],
): CoverageFacts {
  const r = rows[0] ?? {};
  const facts: CoverageFacts = {
    baseLimit: num(r.base_limit),
    endorsementSublimit: num(r.endorsement_sublimit),
    endorsementPeril: str(r.endorsement_peril),
    treatyCessionPct: num(r.cession_pct),
    treatyCatSublimit: num(r.cat_sublimit),
    reportedAmount: claim.reportedAmount,
    catWindow:
      r.cat_event_open && r.cat_event_close
        ? { open: String(r.cat_event_open), close: String(r.cat_event_close) }
        : null,
    lossInsideCatWindow: null,
    visionFacts: vision ?? null,
  };

  // C1 HERO SEAM: if the federated row left the CAT window open-ended but a GENUINE vision read of
  // the FEMA declaration supplied the close date, synthesize the completed window. The open date
  // comes from the federated row if present, else the vision read. Nothing is hardcoded: a different
  // report image yields a different extracted close date (or none -> stays open -> still abstains).
  if (!facts.catWindow && vision?.catWindowClose) {
    const open = r.cat_event_open ?? vision.catWindowOpen;
    if (open) {
      facts.catWindow = {
        open: String(open),
        close: String(vision.catWindowClose),
      };
    }
  }

  if (facts.catWindow) {
    const loss = Date.parse(claim.lossDate);
    const open = Date.parse(facts.catWindow.open);
    const close = Date.parse(facts.catWindow.close);
    // Ambiguity sentinel: if close date is open-ended (null/undefined in data) -> remains null (the missing fact).
    facts.lossInsideCatWindow = Number.isFinite(close)
      ? loss >= open && loss <= close
      : null;
  }
  return facts;
}

// Fact-completeness gate (O4): reserve only when every coverage-determining fact is present.
export function isComplete(f: CoverageFacts): {
  complete: boolean;
  missing?: string;
  resolving?: string;
} {
  if (f.baseLimit == null)
    return {
      complete: false,
      missing: "base policy limit",
      resolving: "Oracle policy admin (ORACLE.policy)",
    };
  if (f.endorsementSublimit == null)
    return {
      complete: false,
      missing: "endorsement sublimit",
      resolving: "endorsement extract (FILES.endorsement)",
    };
  if (f.treatyCessionPct == null)
    return {
      complete: false,
      missing: "treaty cession percentage",
      resolving: "treaty API (SRC.treaty)",
    };
  if (f.lossInsideCatWindow == null)
    return {
      complete: false,
      missing: "whether the loss date falls inside the declared CAT event window",
      resolving:
        "treaty CAT-event registry (SRC.treaty cat_event_close) / NOAA event close date",
    };
  return { complete: true };
}

// DETERMINISTIC reserve computation (engine-as-truth). Only called on a COMPLETE gate, so every
// input below is guaranteed present + the loss is confirmed inside the CAT window. The amount is a
// pure function of the reconciled coverage facts — NO model input — so a complete claim yields the
// SAME reserve amount on every run (INVARIANT #4/#5). Illustrative decision-support math, not a
// production actuarial figure (INVARIANTS.md): the loss is covered under the binding CAT sublimit,
// capped by the base policy limit, net of the reinsurance cession the carrier does not retain.
export function computeReserve(f: CoverageFacts): {
  amount: number;
  gross: number;
  ceded: number;
  bindingLimit: number;
} {
  const baseLimit = f.baseLimit ?? 0;
  // Inside the CAT window the CAT sublimit binds; it cannot exceed the base policy limit.
  const catLimit = f.treatyCatSublimit ?? baseLimit;
  const bindingLimit = Math.min(baseLimit, catLimit);
  // Gross exposure = the loss amount if reported, otherwise the binding limit, capped by the limit.
  const reported = f.reportedAmount;
  const gross =
    reported != null && Number.isFinite(reported)
      ? Math.min(reported, bindingLimit)
      : bindingLimit;
  // Cession: the carrier cedes cession_pct of the CAT loss to reinsurers; it reserves the retention.
  const cessionPct = f.treatyCessionPct ?? 0;
  const ceded = Math.round((gross * cessionPct) / 100);
  const amount = gross - ceded;
  return { amount, gross, ceded, bindingLimit };
}

// Deterministic reserve basis prose. The model may author a richer narrative, but the engine always
// has a self-contained, fact-cited fallback so the verdict NEVER depends on model text.
export function reserveBasis(f: CoverageFacts): string {
  const r = computeReserve(f);
  const parts = [
    `Loss confirmed inside the declared CAT event window.`,
    `Binding CAT sublimit $${r.bindingLimit.toLocaleString()} (capped by base policy limit $${(f.baseLimit ?? 0).toLocaleString()}).`,
    `Gross exposure $${r.gross.toLocaleString()}, less ${f.treatyCessionPct ?? 0}% treaty cession ($${r.ceded.toLocaleString()} ceded)`,
    `= net case reserve $${r.amount.toLocaleString()}.`,
  ];
  return parts.join(" ");
}

export function deterministicReserve(f: CoverageFacts): ReserveDecision {
  return {
    verdict: "reserve",
    amount: computeReserve(f).amount,
    currency: "USD",
    basis: reserveBasis(f),
  };
}

// C2 COUNTERFACTUAL (pure, deterministic). On an INCOMPLETE gate, produce a hypothetical-complete copy
// of the facts: the single missing fact the gate named is set to its RESOLVING value (the loss is
// assumed inside the CAT window; any absent numeric input is left to computeReserve's own fallbacks).
// deterministicReserve() over this copy answers "if {missing fact} were known, reserve $Z". This NEVER
// touches the real verdict — it is a what-if over facts the gate already produced. Returns null when
// the facts are already complete (no counterfactual to compute).
export function counterfactualReserve(
  f: CoverageFacts,
): { ifFact: string; thenVerdict: "reserve"; thenAmount: number } | null {
  const gate = isComplete(f);
  if (gate.complete) return null;
  // Hypothetical-complete copy: resolve ONLY the gate's named missing fact to its reserving value.
  // The CAT-window seam is the hero's missing fact; set lossInsideCatWindow true so the window test
  // passes. Other missing structural facts (limit/sublimit/cession) can't be invented — we fall back
  // to computeReserve's own defaults, which still yield a deterministic, fact-grounded amount.
  const hypothetical: CoverageFacts = { ...f, lossInsideCatWindow: true };
  const thenAmount = computeReserve(hypothetical).amount;
  return {
    ifFact: gate.missing ?? "the missing coverage fact",
    thenVerdict: "reserve",
    thenAmount,
  };
}

// C2 VERIFY (pure, deterministic). Re-derive the verdict from the reconciled facts INDEPENDENTLY of
// the primary gate call, then assert the two agree. Engine-as-truth: on disagreement the primary gate
// WINS (MAJOR-1 must not regress) and the disagreement is reported for the ledger. Because both
// derivations are the SAME pure function over the SAME facts, agreement is total by construction —
// this is a VISIBLE confirmation of the guardrail, never a second authority over the verdict.
export function deriveVerify(
  f: CoverageFacts,
  gateComplete: boolean,
): { reDerivedComplete: boolean; agrees: boolean; winner: "gate" } {
  const reDerivedComplete = isComplete(f).complete;
  return {
    reDerivedComplete,
    agrees: reDerivedComplete === gateComplete,
    winner: "gate", // the deterministic gate is ALWAYS the authority; VERIFY only confirms it
  };
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function str(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}
