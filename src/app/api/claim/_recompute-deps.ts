// File: src/app/api/claim/_recompute-deps.ts
// C4.1 "Re-derive from live sources" wiring: load the LAST persisted decision (+ the federated
// source ids that run used) from the append-only Trust Ledger, so a fresh recompute can be DIFFED
// against it. This is a READ re-derivation only — it never mutates isComplete / engine-as-truth /
// reconcile authority; it reads the same earned ledger the replay surface reads.

import { TrustLedger } from "@/adapters/meterless/trust-ledger";
import type { Decision } from "@/core/types";

export interface StoredRun {
  decision: Decision;
  sources: string[]; // federated source ids the stored run actually used
}

// The ledger is append-only across every resolve of a claim, so the "stored decision" is the LAST
// decide/abstain step, and its run's sources are the federate steps AFTER the prior decide/abstain
// (the slice belonging to that final run).
export async function loadStoredRun(claimId: string): Promise<StoredRun | null> {
  const ledger = new TrustLedger(process.env.LEDGER_DIR ?? "./evidence/ledger");
  const history = await ledger.history(claimId);

  let decideIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === "decide" || history[i].action === "abstain") {
      decideIdx = i;
      break;
    }
  }
  if (decideIdx === -1) return null;

  const decision = history[decideIdx].details.decision as Decision | undefined;
  if (!decision || typeof decision.verdict !== "string") return null;

  // Walk back to the start of this run (just after the previous decide/abstain) and collect the
  // federate steps' source ids within it.
  let runStart = 0;
  for (let i = decideIdx - 1; i >= 0; i--) {
    if (history[i].action === "decide" || history[i].action === "abstain") {
      runStart = i + 1;
      break;
    }
  }
  const sources = new Set<string>();
  for (let i = runStart; i <= decideIdx; i++) {
    if (history[i].action !== "federate") continue;
    const d = history[i].details;
    for (const s of (d.sources as string[] | undefined) ?? []) sources.add(s);
    if (typeof d.source === "string") sources.add(d.source);
  }
  return { decision, sources: [...sources] };
}

// The federated source ids of a FRESH recompute run, collected from the step side-channel. Reads
// ONLY `federate` steps — symmetric with loadStoredRun, so the stored and recomputed source sets are
// the SAME kind of id (the zetaris join names + OpenFEMA's source), never contaminated with probe
// source ids. Kept separate from the Decision so the diff can surface a genuine source Δ.
export function collectRunSources(): {
  sink: (action: string, details: Record<string, unknown>) => void;
  sources: () => string[];
} {
  const sources = new Set<string>();
  return {
    sink: (action, d) => {
      if (action !== "federate") return;
      for (const s of (d.sources as string[] | undefined) ?? []) sources.add(s);
      if (typeof d.source === "string") sources.add(d.source);
    },
    sources: () => [...sources],
  };
}
