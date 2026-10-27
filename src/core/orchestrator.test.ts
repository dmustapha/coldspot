// File: src/core/orchestrator.test.ts
// Engine-as-truth proof (INVARIANT #4/#5): the deterministic completeness gate — not the model —
// authors the VERDICT. These tests inject a HOSTILE model (reasonDecision) that tries to flip the
// verdict in both directions, and assert the orchestrator overrides it to the gate's decision with
// the engine-computed reserve amount / gate-named missing fact. The override is logged.
import { describe, it, expect } from "vitest";
import {
  runClaim,
  runStateFootprint,
  type OrchestratorDeps,
} from "./orchestrator";
import type { RunState } from "./types";
import { deriveVerify, counterfactualReserve, isComplete } from "./reconcile";
import type {
  ClaimContext,
  Decision,
  FederatedRow,
  LedgerStep,
  ProbeResult,
  SourceDescriptor,
} from "./types";

const CTX: ClaimContext = {
  claimId: "CLM-TEST",
  policyId: "POL-1002",
  peril: "wind",
  lossDate: "2024-09-26",
  region: "FL",
  reportedAmount: 900_000,
};

const CATALOG: SourceDescriptor[] = [
  { id: "policy", type: "sql", probeKind: "zetaris", zetarisName: "FILES.policy", label: "Policy admin" },
];

// A COMPLETE federated row (Helene window, close date present, loss inside) -> gate COMPLETE.
const COMPLETE_ROW: FederatedRow = {
  base_limit: 3_000_000,
  endorsement_sublimit: 750_000,
  endorsement_peril: "wind",
  cession_pct: 50,
  cat_sublimit: 3_000_000,
  cat_event_open: "2024-09-24",
  cat_event_close: "2024-09-28",
};

// An INCOMPLETE row (cat_event_close null -> lossInsideCatWindow null) -> gate INCOMPLETE.
const INCOMPLETE_ROW: FederatedRow = { ...COMPLETE_ROW, cat_event_close: null };

function makeDeps(
  row: FederatedRow,
  model: Decision,
  log: LedgerStep[],
): OrchestratorDeps {
  return {
    listCatalog: async () => CATALOG,
    planTools: async () => [
      { name: "probe_source", args: { source_id: "policy" } },
      { name: "federated_query", args: {} },
    ],
    probe: async (s): Promise<ProbeResult> => ({
      sourceId: s.id,
      relevant: true,
      score: 1,
      reason: "test",
      signals: { schemaMatch: true, lastRefreshIso: null, freshnessDays: 1, rowCoverage: 1 },
      status: "relevant",
    }),
    federate: async () => [row],
    reasonDecision: async () => model,
    log: async (s) => {
      log.push(s);
    },
    now: () => 1,
  };
}

describe("engine-as-truth: model cannot flip the gate verdict", () => {
  it("COMPLETE gate + model tries to ABSTAIN -> overridden to deterministic reserve", async () => {
    const log: LedgerStep[] = [];
    // Hostile model: invents a fake missing fact to abstain on a complete claim.
    const hostile: Decision = {
      verdict: "abstain",
      missing_fact: "visionFacts (fabricated)",
      resolving_source: "nowhere",
      partial_basis: "model made this up",
    };
    const decision = await runClaim(makeDeps(COMPLETE_ROW, hostile, log), CTX);

    expect(decision.verdict).toBe("reserve");
    if (decision.verdict !== "reserve") throw new Error("unreachable");
    expect(decision.amount).toBe(450_000); // engine-computed, not the model's
    expect(decision.basis).toContain("$450,000");

    const override = log.find((s) => s.action === "gate-override");
    expect(override).toBeTruthy();
    expect(override?.details.modelVerdict).toBe("abstain");
    expect(override?.details.invented_missing_fact).toBe("visionFacts (fabricated)");
  });

  it("COMPLETE gate + cooperative model reserve -> keeps verdict, engine owns the amount", async () => {
    const log: LedgerStep[] = [];
    const cooperative: Decision = {
      verdict: "reserve",
      amount: 999_999_999, // model's bogus amount — MUST be ignored
      currency: "USD",
      basis: "a sufficiently long model-authored basis narrative here",
    };
    const decision = await runClaim(makeDeps(COMPLETE_ROW, cooperative, log), CTX);

    expect(decision.verdict).toBe("reserve");
    if (decision.verdict !== "reserve") throw new Error("unreachable");
    expect(decision.amount).toBe(450_000); // engine amount, NOT 999,999,999
    // No override logged when the model already agreed on the verdict.
    expect(log.find((s) => s.action === "gate-override")).toBeUndefined();
  });

  it("INCOMPLETE gate + model tries to RESERVE -> overridden to deterministic abstain naming the gate fact", async () => {
    const log: LedgerStep[] = [];
    const hostile: Decision = {
      verdict: "reserve",
      amount: 2_000_000,
      currency: "USD",
      basis: "model wants to reserve on an incomplete claim",
    };
    const decision = await runClaim(makeDeps(INCOMPLETE_ROW, hostile, log), CTX);

    expect(decision.verdict).toBe("abstain");
    if (decision.verdict !== "abstain") throw new Error("unreachable");
    expect(decision.missing_fact).toContain("CAT event window");
    expect(decision.resolving_source.length).toBeGreaterThan(0);

    const override = log.find((s) => s.action === "gate-override");
    expect(override).toBeTruthy();
    expect(override?.details.modelVerdict).toBe("reserve");
  });

  it("determinism: same inputs -> byte-identical decision across repeated runs (both directions)", async () => {
    const reserveA = await runClaim(makeDeps(COMPLETE_ROW, { verdict: "abstain", missing_fact: "x", resolving_source: "y", partial_basis: "z" }, []), CTX);
    const reserveB = await runClaim(makeDeps(COMPLETE_ROW, { verdict: "abstain", missing_fact: "x", resolving_source: "y", partial_basis: "z" }, []), CTX);
    expect(reserveA).toEqual(reserveB);

    const abstainA = await runClaim(makeDeps(INCOMPLETE_ROW, { verdict: "reserve", amount: 1, currency: "USD", basis: "b" }, []), CTX);
    const abstainB = await runClaim(makeDeps(INCOMPLETE_ROW, { verdict: "reserve", amount: 1, currency: "USD", basis: "b" }, []), CTX);
    expect(abstainA).toEqual(abstainB);
  });
});

// C2 — VERIFY stage: a visible, deterministic re-derivation that must AGREE with the gate; on
// disagreement the deterministic gate WINS (engine-as-truth). deriveVerify is a pure function over the
// facts, so agreement is total by construction — this proves the VERIFY-agreement property directly.
describe("C2 VERIFY: re-derivation agrees with the gate; gate wins on disagreement", () => {
  it("agrees with a COMPLETE gate", () => {
    const facts = { baseLimit: 3_000_000, endorsementSublimit: 750_000, treatyCessionPct: 50, lossInsideCatWindow: true };
    const gate = isComplete(facts);
    const v = deriveVerify(facts, gate.complete);
    expect(v.reDerivedComplete).toBe(true);
    expect(v.agrees).toBe(true);
    expect(v.winner).toBe("gate");
  });

  it("agrees with an INCOMPLETE gate", () => {
    const facts = { baseLimit: 3_000_000, lossInsideCatWindow: null };
    const gate = isComplete(facts);
    const v = deriveVerify(facts, gate.complete);
    expect(v.reDerivedComplete).toBe(false);
    expect(v.agrees).toBe(true);
  });

  it("gate WINS when a hostile caller claims the wrong gate verdict (MAJOR-1 preserved)", () => {
    const facts = { baseLimit: 3_000_000, lossInsideCatWindow: null }; // really incomplete
    // Simulate a disagreement: caller asserts complete=true though the facts are incomplete.
    const v = deriveVerify(facts, true);
    expect(v.agrees).toBe(false);
    expect(v.reDerivedComplete).toBe(false); // the engine re-derivation is the truth
    expect(v.winner).toBe("gate"); // the deterministic gate is always the authority
  });
});

// C2 — COUNTERFACTUAL: on an abstain, the counterfactual amount == deterministicReserve() over a
// hypothetical-complete copy of the facts (the missing fact resolved). Falsifiable and pure.
describe("C2 COUNTERFACTUAL: amount == deterministicReserve() of the hypothetical-complete facts", () => {
  it("abstaining hero facts -> counterfactual names the CAT fact + the exact hypothetical reserve", async () => {
    const facts = {
      baseLimit: 5_000_000,
      endorsementSublimit: 1_000_000,
      treatyCessionPct: 40,
      treatyCatSublimit: 2_000_000,
      reportedAmount: 1_250_000,
      lossInsideCatWindow: null, // the missing fact -> abstain
    };
    const cf = counterfactualReserve(facts);
    expect(cf).not.toBeNull();
    expect(cf!.thenVerdict).toBe("reserve");
    expect(cf!.ifFact).toContain("CAT event window");
    // The hypothetical-complete copy sets lossInsideCatWindow true; the amount is the engine's own
    // deterministicReserve over that copy — min(5M,2M) binding, gross capped at reported 1.25M, less
    // 40% cession -> 750k.
    const { deterministicReserve } = await import("./reconcile");
    const expected = deterministicReserve({ ...facts, lossInsideCatWindow: true }).amount;
    expect(cf!.thenAmount).toBe(expected);
    expect(cf!.thenAmount).toBe(750_000);
  });

  it("returns null for already-complete facts (no counterfactual to compute)", () => {
    const complete = { baseLimit: 3_000_000, endorsementSublimit: 750_000, treatyCessionPct: 50, lossInsideCatWindow: true };
    expect(counterfactualReserve(complete)).toBeNull();
  });
});

// C2 — MARKOVIAN bounded RunState: the serialized footprint is CONSTANT in the number of sources. A
// 1-source RunState and a 100-source RunState carry the SAME shape (counts + one facts snapshot), so
// their footprints are identical given identical facts — proving flat-cost state (Track 03).
describe("C2 MARKOVIAN: RunState footprint is bounded / constant across source count", () => {
  const facts = { baseLimit: 5_000_000, lossInsideCatWindow: true };
  const mk = (probed: number, confirmed: number): RunState => ({
    claimId: "CLM-BOUND",
    stage: "reconcile",
    probedCount: probed,
    confirmedCount: confirmed,
    facts,
    complete: true,
  });

  it("1-source vs 100-source RunState have the same footprint (counts, not payloads)", () => {
    const one = runStateFootprint(mk(1, 1));
    const hundred = runStateFootprint(mk(100, 99));
    // Only the integer counts differ (a couple of digits), never a per-source payload accumulation.
    // The bound: the footprint grows at most logarithmically with the digit-length of the counts.
    expect(Math.abs(hundred - one)).toBeLessThanOrEqual(3);
  });

  it("footprint does not depend on how many sources were probed (no unbounded accumulation)", () => {
    const sizes = [1, 4, 6, 50].map((n) => runStateFootprint(mk(n, n)));
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    expect(max - min).toBeLessThanOrEqual(2); // digit-count only; flat-cost
  });
});
