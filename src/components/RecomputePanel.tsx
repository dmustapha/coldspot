// File: src/components/RecomputePanel.tsx
// C4.1 "Re-derive from live sources": a judge clicks the button on a resolved claim -> the agent
// re-runs the IDENTICAL resolve loop against LIVE sources -> this panel renders a field-level DIFF
// of the fresh decision vs the stored one. A stable estate re-derives IDENTICALLY (the "✓ Identical"
// state — determinism, demoed as a product feature); a mutated source surfaces a highlighted Δ.
// This is auditable reserving: the stored verdict is not trusted, it is re-proven from source.
"use client";

import { useCallback, useRef, useState } from "react";

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}
interface DecisionDiff {
  identical: boolean;
  changes: FieldChange[];
}
interface RecomputeResult {
  diff: DecisionDiff;
  storedSources: string[];
  recomputedSources: string[];
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "·";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type Phase = "idle" | "running" | "done" | "error";

export function RecomputePanel({
  claimId,
  imageDataUrl,
  reportDataUrl,
}: {
  claimId: string;
  imageDataUrl?: string;
  reportDataUrl?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RecomputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("running");
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/claim/${claimId}/recompute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageDataUrl, reportDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `recompute failed (${res.status})`);
      setResult(data as RecomputeResult);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }, [claimId, imageDataUrl, reportDataUrl]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={phase === "running"}
          className="rounded-chip border border-accent-30 bg-accent-08 px-4 py-2 text-[13px] font-medium text-accent-hi transition-colors duration-150 hover:bg-accent-12 active:bg-accent-18 disabled:cursor-not-allowed disabled:border-ink-12 disabled:bg-surface-1 disabled:text-ink-faint"
        >
          {phase === "running" ? "Re-deriving from live sources…" : "↻ Re-derive from live sources"}
        </button>
        <span className="font-mono text-[11px] text-ink-faint">
          runs the identical resolve loop live, diffs it against the stored decision
        </span>
      </div>

      {error && (
        <p role="alert" className="card border-garnet-25 p-3 text-[13px] text-garnet">
          {error}
        </p>
      )}

      {result && result.diff.identical && (
        <div className="rounded-card border border-jade-25 bg-jade-12 p-4">
          <p className="font-mono text-[12.5px] font-semibold uppercase tracking-[0.14em] text-jade">
            ✓ identical · re-derived from live sources
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-dim">
            Every field matched the stored decision. Sources re-federated:{" "}
            <span className="mono-data text-ink">
              {result.recomputedSources.join(", ") || "none"}
            </span>
          </p>
        </div>
      )}

      {result && !result.diff.identical && (
        <div className="rounded-card border border-garnet-25 bg-garnet-12 p-4">
          <p className="font-mono text-[12.5px] font-semibold uppercase tracking-[0.14em] text-garnet">
            Δ changed · {result.diff.changes.length} field
            {result.diff.changes.length === 1 ? "" : "s"} differ from the stored decision
          </p>
          <table className="mt-3 w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <th className="pb-1 pr-4 font-medium">field</th>
                <th className="pb-1 pr-4 font-medium">stored</th>
                <th className="pb-1 font-medium">re-derived</th>
              </tr>
            </thead>
            <tbody>
              {result.diff.changes.map((c) => (
                <tr key={c.field} className="border-t border-ink-08 align-top">
                  <td className="mono-data py-1.5 pr-4 text-[11.5px] text-garnet">{c.field}</td>
                  <td className="mono-data py-1.5 pr-4 text-[11.5px] text-ink-faint line-through decoration-ink-30">
                    {fmt(c.from)}
                  </td>
                  <td className="mono-data py-1.5 text-[11.5px] text-ink">{fmt(c.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
