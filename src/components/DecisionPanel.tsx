// File: src/components/DecisionPanel.tsx
// Renders the agent's final verdict. ABSTAIN is the money beat: a confident refusal
// that NAMES the exact missing fact and the source that resolves it. Styled as a
// deliberate, authoritative decision in the ice voice, NOT an error state.
"use client";

import type { Decision } from "@/core/types";
import { VerdictChip } from "@/components/cold/Chrome";

export function DecisionPanel({ decision }: { decision: Decision | null }) {
  if (!decision) return null;

  if (decision.verdict === "reserve") {
    return (
      <section aria-label="Reserve decision" className="card border-jade-25 p-5">
        <div className="flex items-baseline gap-3">
          <VerdictChip verdict="reserve" />
          <span className="numeral text-[32px] text-jade">
            <span className="unit">$</span>
            {decision.amount.toLocaleString()}
            <span className="unit ml-1.5 text-ink-faint">{decision.currency}</span>
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">{decision.basis}</p>
      </section>
    );
  }

  // ABSTAIN: the differentiating beat. The gate held open, the cold spot named.
  return (
    <section
      aria-label="Abstention decision"
      className="card border-ice-28 p-5"
      style={{ boxShadow: "0 0 40px -12px var(--ice-16)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <VerdictChip verdict="abstain" />
        <span className="font-display text-[19px] font-700 text-ink" style={{ fontWeight: 700 }}>
          Reserve withheld. Here is exactly why.
        </span>
      </div>

      <dl className="mt-4 space-y-3">
        <div className="rounded-card border border-dashed border-ice-45 bg-ice-10 p-3.5">
          <dt className="eyebrow-ice">missing fact · the cold spot</dt>
          <dd className="mt-1.5 text-[15.5px] font-medium leading-snug text-ice">
            {decision.missing_fact}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
            resolving source
          </dt>
          <dd className="mono-data mt-1 text-[13px] text-ink">{decision.resolving_source}</dd>
        </div>
      </dl>

      <p className="mt-4 border-t border-ink-08 pt-3 text-[13.5px] leading-relaxed text-ink-dim">
        <span className="text-ink-faint">What it could confirm: </span>
        {decision.partial_basis}
      </p>
    </section>
  );
}
