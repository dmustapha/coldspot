// File: src/core/recompute-diff.ts
// Deterministic, pure field-level DIFF between a STORED decision (last persisted) and a freshly
// RECOMPUTED one (the identical resolve loop re-run against live sources). Powers C4.1 "Re-derive
// from live sources": a stable estate re-derives IDENTICALLY (MAJOR-1 => diff.identical === true);
// a mutated source surfaces a visible, correct field-level Δ. Imports nothing from adapters/app —
// it only reads the Decision shape + the federated source-id sets, so it is unit-testable offline.

import type { Decision } from "./types";

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface DecisionDiff {
  identical: boolean;
  changes: FieldChange[];
}

// The ENGINE-AS-TRUTH decision fields: the verdict + its cession math (amount/currency) + the
// abstain seam (missing_fact / resolving_source / counterfactual). These are set DETERMINISTICALLY
// by the gate — a stable estate re-derives them identically (MAJOR-1). The `basis`/`partial_basis`
// narrative is MODEL-AUTHORED prose (orchestrator: "the model may author the basis prose"), which
// legitimately varies run-to-run and is NOT part of the reserving conclusion — diffing it would make
// a deterministic reserve look "changed". So the diff is over the derived conclusion, not the prose.
function decisionFields(d: Decision | null): Record<string, unknown> {
  if (!d) return { verdict: null };
  if (d.verdict === "reserve") {
    return { verdict: "reserve", amount: d.amount, currency: d.currency };
  }
  return {
    verdict: "abstain",
    missing_fact: d.missing_fact,
    resolving_source: d.resolving_source,
    counterfactual: d.counterfactual ?? null,
  };
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Compare the union of both sides' field keys so a field that appears/vanishes across verdicts
// (e.g. amount -> missing_fact when a reserve flips to an abstain) surfaces as an explicit change.
function diffRecords(
  prefix: string,
  stored: Record<string, unknown>,
  recomputed: Record<string, unknown>,
): FieldChange[] {
  const keys = new Set([...Object.keys(stored), ...Object.keys(recomputed)]);
  const changes: FieldChange[] = [];
  for (const k of keys) {
    if (!eq(stored[k], recomputed[k])) {
      changes.push({ field: prefix ? `${prefix}.${k}` : k, from: stored[k], to: recomputed[k] });
    }
  }
  return changes;
}

// Structured field-level diff: the decision fields + the set of federated source ids each run used
// (an added/removed source is itself auditable — a mutated estate that drops the FEMA source shows
// as a sources Δ, not a silent recompute). Falsifiable: identical iff zero changes.
export function diffDecisions(
  stored: Decision | null,
  recomputed: Decision,
  storedSources: string[] = [],
  recomputedSources: string[] = [],
): DecisionDiff {
  const changes = diffRecords("", decisionFields(stored), decisionFields(recomputed));
  const sortedStored = [...storedSources].sort();
  const sortedRecomputed = [...recomputedSources].sort();
  if (!eq(sortedStored, sortedRecomputed)) {
    changes.push({ field: "sources", from: sortedStored, to: sortedRecomputed });
  }
  return { identical: changes.length === 0, changes };
}
