// File: src/components/ClaimThermogram.tsx
// The signature engine, driven by the REAL ledger. Fetches /api/ledger/[claimId],
// takes the LATEST run's reconcile entry (its `facts` object is the completeness
// gate's own input) and the terminal decide/abstain entry, and renders the
// COLD-SPOT SWEEP: warm cells = facts the governed sources landed; cold cells =
// the literal nulls the gate refused over. Pure view; no synthesized state.
"use client";

import { useEffect, useState } from "react";
import { SweepEngine, type FactCell, type Verdict } from "@/components/cold/Sweep";

interface Entry {
  action: string;
  details: Record<string, unknown>;
}

const COLD_NAMES: Record<string, string> = {
  baseLimit: "base limit",
  endorsementSublimit: "sublimit",
  endorsementPeril: "peril",
  treatyCessionPct: "cession",
  treatyCatSublimit: "CAT sublimit",
  reportedAmount: "reported amount",
  catWindow: "CAT window",
  lossInsideCatWindow: "loss in window",
};

const FACT_LABELS: Record<string, (v: unknown) => string> = {
  baseLimit: (v) => `base limit ${money(v)}`,
  endorsementSublimit: (v) => `sublimit ${money(v)}`,
  endorsementPeril: (v) => `peril: ${String(v)}`,
  treatyCessionPct: (v) => `cession ${String(v)}%`,
  treatyCatSublimit: (v) => `CAT sublimit ${money(v)}`,
  reportedAmount: (v) => `reported ${money(v)}`,
  catWindow: () => "CAT window",
  lossInsideCatWindow: () => "loss in window",
};

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 1).replace(/\.0$/, "")}M` : `$${n.toLocaleString()}`;
}

interface Derived {
  cells: FactCell[];
  verdict: Verdict;
  missingFact: string | null;
  resolvingSource: string | null;
  reserveAmount: number | null;
  counterfactual: { amount: number; verdict: string } | null;
}

export type RunSelector = "latest" | "latest-abstain";

function derive(entries: Entry[], run: RunSelector = "latest"): Derived | null {
  // pick the terminal for the requested run, then walk backwards from it for the
  // reconcile facts + counterfactual that belong to that same run
  let terminalIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if ((e.action === "decide" || e.action === "abstain") && e.details.decision) {
      if (run === "latest" || e.action === "abstain") {
        terminalIdx = i;
        break;
      }
    }
  }
  if (terminalIdx === -1) return null;
  const terminal = entries[terminalIdx];
  const decision = terminal.details.decision as Record<string, unknown>;
  let verdict: Verdict = terminal.action === "abstain" ? "abstain" : "reserve";
  let facts: Record<string, unknown> | null = null;
  let counterfactual: { amount: number; verdict: string } | null = null;
  for (let i = terminalIdx - 1; i >= 0; i--) {
    const e = entries[i];
    const d = e.details;
    if (e.action === "decide" || e.action === "abstain") break; // crossed into the prior run
    if (!facts && e.action === "reconcile" && d.facts) {
      facts = d.facts as Record<string, unknown>;
    }
    if (!counterfactual && e.action === "counterfactual" && d.thenAmount != null) {
      counterfactual = { amount: Number(d.thenAmount), verdict: String(d.thenVerdict ?? "reserve") };
    }
    if (facts && counterfactual) break;
  }
  if (!facts) return null;
  const cells: FactCell[] = Object.keys(FACT_LABELS).map((key) => {
    const v = facts![key];
    return {
      id: key,
      label: v == null ? COLD_NAMES[key] : FACT_LABELS[key](v),
      state: v == null ? "cold" : "warm",
    };
  });
  const dv = decision?.verdict ? String(decision.verdict) : null;
  if (dv === "deny") verdict = "deny";
  return {
    cells,
    verdict,
    missingFact: decision?.missing_fact ? String(decision.missing_fact) : null,
    resolvingSource: decision?.resolving_source ? String(decision.resolving_source) : null,
    reserveAmount: decision?.amount != null ? Number(decision.amount) : null,
    counterfactual,
  };
}

export function ClaimThermogram({
  claimId,
  run = "latest",
  footnote,
}: {
  claimId: string;
  run?: RunSelector;
  footnote?: React.ReactNode;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "empty" }
    | { status: "ready"; d: Derived }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/ledger/${claimId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const d = derive((data.entries ?? []) as Entry[], run);
        setState(d ? { status: "ready", d } : { status: "empty" });
      })
      .catch(() => alive && setState({ status: "empty" }));
    return () => {
      alive = false;
    };
  }, [claimId, run]);

  if (state.status === "loading") {
    return <div className="card h-[220px] animate-pulse" aria-busy="true" />;
  }
  if (state.status === "empty") {
    // Branded empty state: an unswept lattice, every cell dark.
    return (
      <div className="card flex flex-col items-center gap-4 p-10 text-center">
        <span className="inline-flex gap-[4px]" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="h-[14px] w-[14px] rounded-[3px] border border-dashed border-ink-18" />
          ))}
        </span>
        <p className="text-[13.5px] text-ink-dim">
          No reconciled run on the ledger yet. Resolve the claim to sweep its facts.
        </p>
      </div>
    );
  }

  const { d } = state;
  return (
    <div className="card p-5" style={{ boxShadow: d.verdict === "abstain" ? "0 0 60px -18px var(--ice-28)" : "var(--glow-lamp)" }}>
      <SweepEngine
        cells={d.cells}
        verdict={d.verdict}
        missingFact={d.missingFact}
        animateIn
        columns={4}
        stamp={
          d.verdict === "abstain" ? (
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.25em] text-ice">
                Abstain · gate held open
              </span>
              {d.counterfactual && (
                <span className="font-mono text-[12px] text-ink-dim">
                  if known: {d.counterfactual.verdict}{" "}
                  <span className="text-jade">${d.counterfactual.amount.toLocaleString()}</span>
                </span>
              )}
            </div>
          ) : d.verdict === "reserve" ? (
            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.25em] text-jade">
                Reserve · gate latched
              </span>
              {d.reserveAmount != null && (
                <span className="numeral text-[22px] text-jade">
                  <span className="unit">$</span>
                  {d.reserveAmount.toLocaleString()}
                </span>
              )}
            </div>
          ) : (
            <span className="mt-3 block font-mono text-[13px] uppercase tracking-[0.25em] text-ink-faint">
              investigating
            </span>
          )
        }
      />
      {d.verdict === "abstain" && d.resolvingSource && (
        <p className="mt-3 border-t border-ink-08 pt-3 font-mono text-[11.5px] text-ink-dim">
          <span className="text-ink-faint">resolves at: </span>
          {d.resolvingSource}
        </p>
      )}
      {footnote}
    </div>
  );
}
