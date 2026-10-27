// File: evals/runner/c2-reasoning.ts
// C2 GATE — reasoning-architecture evals, all falsifiable:
//   (1) VERIFY-agreement: over all seeded claims, the VERIFY re-derivation AGREES with the
//       deterministic gate on 100% of runs (disagreement => gate wins, logged). Read from the real
//       `verify` ledger step each resolve persists.
//   (2) Counterfactual-correctness: for each abstain, the `counterfactual` ledger step's thenAmount
//       == deterministicReserve() of the hypothetical-complete facts (recomputed from the persisted
//       `reconcile` step's facts via the SAME engine function — never a hardcoded number).
//   (3) Markovian bound: the RunState footprint is CONSTANT across a 1-source vs multi-source run
//       (asserted directly on runStateFootprint; flat-cost state, Track 03).
//
// Drives the REAL streamed resolve route for each seeded claim, then reads the persisted Trust Ledger
// (GET /api/ledger/[claimId]). Needs the app up on APP_URL. Live NIM -> each resolve is ~1-2 min.

import { deterministicReserve, counterfactualReserve } from "../../src/core/reconcile";
import { runStateFootprint } from "../../src/core/orchestrator";
import type { CoverageFacts, RunState } from "../../src/core/types";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
// Seeded claims spanning both verdict directions + two distinct abstain gaps (CAT window vs base limit).
const SEEDED = ["CLM-4471", "CLM-7781", "CLM-9002"];

interface LedgerEntry {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveViaStream(claimId: string, attempts = 3): Promise<void> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/claim/resolve/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, question: "reserve?" }),
      });
      if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sawDecision = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const o = JSON.parse(line);
          if (o.type === "decision") sawDecision = true;
          else if (o.type === "error") throw new Error(String(o.error));
        }
      }
      if (!sawDecision) throw new Error("stream closed without a decision");
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (i < attempts) {
        console.log(`  [c2] transient (attempt ${i}/${attempts}): ${lastErr} — retrying`);
        await sleep(3000 * i);
      }
    }
  }
  throw new Error(`resolveViaStream(${claimId}) failed after ${attempts}: ${lastErr}`);
}

async function getLedger(claimId: string): Promise<LedgerEntry[]> {
  const res = await fetch(`${APP_URL}/api/ledger/${claimId}`);
  if (!res.ok) throw new Error(`ledger HTTP ${res.status}`);
  const d = (await res.json()) as { entries: LedgerEntry[] };
  return d.entries ?? [];
}

// The last entry of a given action for this claim (the step from the most recent resolve).
function lastStep(ledger: LedgerEntry[], action: string): LedgerEntry | undefined {
  for (let i = ledger.length - 1; i >= 0; i--) if (ledger[i].action === action) return ledger[i];
  return undefined;
}

export interface C2Result {
  harness: "c2-reasoning";
  verifyAgreement: { claim: string; agrees: boolean; gateComplete: boolean; reDerived: boolean }[];
  verifyAllAgree: boolean;
  counterfactual: { claim: string; ledgerAmount: number; recomputed: number; matches: boolean }[];
  counterfactualAllMatch: boolean;
  markovianBound: { oneSourceBytes: number; multiSourceBytes: number; constant: boolean };
  verdict: "PASS" | "FAIL";
}

// (3) Markovian bound — asserted directly: a 1-source and a 100-source RunState with identical facts
// have the same footprint (only the integer counts differ by a couple of digits). Flat-cost state.
function markovianBoundCheck(): C2Result["markovianBound"] {
  const facts: CoverageFacts = { baseLimit: 5_000_000, lossInsideCatWindow: true };
  const mk = (probed: number, confirmed: number): RunState => ({
    claimId: "CLM-BOUND",
    stage: "reconcile",
    probedCount: probed,
    confirmedCount: confirmed,
    facts,
    complete: true,
  });
  const one = runStateFootprint(mk(1, 1));
  const many = runStateFootprint(mk(100, 99));
  return { oneSourceBytes: one, multiSourceBytes: many, constant: Math.abs(many - one) <= 3 };
}

export async function runC2Eval(): Promise<C2Result> {
  const markovianBound = markovianBoundCheck();
  console.log(
    `[c2] Markovian bound: 1-source=${markovianBound.oneSourceBytes}B vs multi-source=${markovianBound.multiSourceBytes}B -> ${markovianBound.constant ? "CONSTANT" : "GREW"}`,
  );

  const verifyAgreement: C2Result["verifyAgreement"] = [];
  const counterfactual: C2Result["counterfactual"] = [];

  for (const claim of SEEDED) {
    console.log(`[c2] resolving ${claim} (live) ...`);
    await resolveViaStream(claim);
    const ledger = await getLedger(claim);

    // (1) VERIFY-agreement — the persisted verify step must say agrees:true (gate wins otherwise).
    const v = lastStep(ledger, "verify");
    const agrees = v?.details.agrees === true;
    verifyAgreement.push({
      claim,
      agrees,
      gateComplete: Boolean(v?.details.gateComplete),
      reDerived: Boolean(v?.details.reDerivedComplete),
    });
    console.log(`  [c2] VERIFY ${claim}: agrees=${agrees}`);

    // (2) Counterfactual-correctness — ONLY on abstains. Recompute from the persisted reconcile facts
    // via the SAME engine function and assert the ledger's counterfactual amount matches.
    const decideStep = lastStep(ledger, "abstain");
    if (decideStep) {
      const cfStep = lastStep(ledger, "counterfactual");
      const reconcileStep = lastStep(ledger, "reconcile");
      const facts = (reconcileStep?.details.facts ?? {}) as CoverageFacts;
      const recomputed = counterfactualReserve(facts)?.thenAmount ?? NaN;
      const ledgerAmount = Number(cfStep?.details.thenAmount ?? NaN);
      const matches = Number.isFinite(recomputed) && ledgerAmount === recomputed;
      counterfactual.push({ claim, ledgerAmount, recomputed, matches });
      console.log(
        `  [c2] COUNTERFACTUAL ${claim}: ledger=$${ledgerAmount.toLocaleString()} recomputed=$${recomputed.toLocaleString()} -> ${matches ? "MATCH" : "MISMATCH"}`,
      );
    }
  }

  const verifyAllAgree = verifyAgreement.length > 0 && verifyAgreement.every((r) => r.agrees);
  const counterfactualAllMatch =
    counterfactual.length > 0 && counterfactual.every((r) => r.matches);
  const verdict: "PASS" | "FAIL" =
    verifyAllAgree && counterfactualAllMatch && markovianBound.constant ? "PASS" : "FAIL";

  return {
    harness: "c2-reasoning",
    verifyAgreement,
    verifyAllAgree,
    counterfactual,
    counterfactualAllMatch,
    markovianBound,
    verdict,
  };
}
