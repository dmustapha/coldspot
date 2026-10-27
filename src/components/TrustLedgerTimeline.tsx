// File: src/components/TrustLedgerTimeline.tsx
// Replays the append-only Trust Ledger for a claim (GET /api/ledger/[claimId]).
// The P3 gate: the timeline shows BOTH what the agent USED and what it REFUSED —
// the `discard` entry (with its signal-derived reason) is the provenance differentiator.
"use client";

import { useEffect, useState } from "react";

interface Entry {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

// Refusal actions get a distinct, deliberately-prominent treatment: the ledger's value
// is proving what the agent walked AWAY from, not just what it leaned on.
const REFUSAL = new Set(["discard", "abstain"]);

// Identity mapping: investigation steps carry the lamp (accent); the terminal
// verdicts carry the data semantics (jade decide / ice abstain); refusals cool.
const ACTION_META: Record<string, { dot: string; label: string }> = {
  probe: { dot: "bg-accent", label: "Probe" },
  discard: { dot: "bg-ink-30", label: "Discard" },
  federate: { dot: "bg-accent-hi", label: "Federate" },
  reconcile: { dot: "bg-ink-45", label: "Reconcile" },
  vision: { dot: "bg-accent-hi", label: "Vision" },
  counterfactual: { dot: "bg-ink-30", label: "Counterfactual" },
  "gate-override": { dot: "bg-garnet", label: "Gate override" },
  verify: { dot: "bg-jade", label: "Verify" },
  decide: { dot: "bg-jade", label: "Decide" },
  abstain: { dot: "bg-ice", label: "Abstain" },
};

// The ledger is append-only, so a claim resolved N times holds N runs' worth of entries.
// The panel shows the LATEST run — the entries from just after the previous terminal
// (decide/abstain) through the final terminal — so the timeline reflects the current
// resolution, not the full audit history (which stays intact in the ledger + API).
function latestRun(entries: Entry[], run: "latest" | "latest-abstain" = "latest"): Entry[] {
  const terminals: number[] = [];
  entries.forEach((e, i) => {
    if (e.action === "decide" || e.action === "abstain") terminals.push(i);
  });
  if (terminals.length === 0) return entries.slice(-12); // in-progress run: show the tail
  let endPos = terminals.length - 1;
  if (run === "latest-abstain") {
    for (let p = terminals.length - 1; p >= 0; p--) {
      if (entries[terminals[p]].action === "abstain") {
        endPos = p;
        break;
      }
    }
  }
  const end = terminals[endPos];
  const prevEnd = endPos >= 1 ? terminals[endPos - 1] : -1;
  return entries.slice(prevEnd + 1, end + 1);
}

// Render each entry in the design's own vocabulary: the load-bearing fact is the
// hero line (the REASON for probes/discards, the verdict for terminals), the rest
// compact labeled chips; the raw JSON stays one disclosure away, never deleted.
function heroLine(e: Entry): { main: string; sub?: string } {
  const d = e.details;
  switch (e.action) {
    case "probe":
      return { main: String(d.source ?? ""), sub: String(d.reason ?? "") };
    case "discard":
      return { main: String(d.source ?? ""), sub: String(d.reason ?? "") };
    case "federate": {
      const main = Array.isArray(d.sources)
        ? (d.sources as string[]).join(" + ")
        : String(d.source ?? "governed JOIN");
      const parts: string[] = [];
      if (d.rowCount != null) parts.push(`${d.rowCount} row${Number(d.rowCount) === 1 ? "" : "s"}`);
      if (d.drivenBy) parts.push(String(d.drivenBy));
      if (d.provenance) parts.push(String(d.provenance));
      return { main, sub: parts.join(" · ") || undefined };
    }
    case "vision": {
      return { main: String(d.source ?? "vision read"), sub: String(d.detail ?? d.provenance ?? "") };
    }
    case "reconcile": {
      const facts = (d.facts ?? {}) as Record<string, unknown>;
      const keys = Object.keys(facts).filter((k) => k !== "factConfidence" && k !== "visionFacts");
      const coldKeys = keys.filter((k) => facts[k] == null);
      return {
        main: coldKeys.length === 0 ? "evidence complete" : `${coldKeys.length} cold of ${keys.length} facts`,
        sub: coldKeys.join(", "),
      };
    }
    case "counterfactual":
      return {
        main: `if known: ${String(d.thenVerdict ?? "reserve")} $${Number(d.thenAmount ?? 0).toLocaleString()}`,
        sub: String(d.ifFact ?? ""),
      };
    case "verify":
      return {
        main: d.agrees ? "re-derivation agrees" : "re-derivation DISAGREES",
        sub: String(d.note ?? ""),
      };
    case "gate-override":
      return { main: "engine-as-truth overrode the model verdict" };
    case "decide": {
      const dec = (d.decision ?? {}) as Record<string, unknown>;
      return {
        main: `reserve $${Number(dec.amount ?? 0).toLocaleString()}`,
        sub: String(dec.basis ?? "").slice(0, 160),
      };
    }
    case "abstain": {
      const dec = (d.decision ?? {}) as Record<string, unknown>;
      return {
        main: String(dec.missing_fact ?? "a required fact is missing"),
        sub: `resolves at: ${String(dec.resolving_source ?? "")}`,
      };
    }
    default:
      return { main: "" };
  }
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: Entry[] };

export function TrustLedgerTimeline({
  claimId,
  run = "latest",
}: {
  claimId: string;
  run?: "latest" | "latest-abstain";
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/ledger/${claimId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setState({ status: "ready", entries: d.entries ?? [] });
      })
      .catch((e) => {
        if (alive) setState({ status: "error", message: String(e) });
      });
    return () => {
      alive = false;
    };
  }, [claimId]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-flat h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="card border-garnet-25 p-3 text-[13px] text-garnet">
        Could not load the ledger: {state.message}
      </p>
    );
  }

  if (state.entries.length === 0) {
    return (
      <p className="card-flat p-4 text-[13px] text-ink-dim">
        No ledger entries yet. Resolve the claim to populate the Trust Ledger.
      </p>
    );
  }

  const shown = latestRun(state.entries, run);
  const hiddenCount = state.entries.length - shown.length;

  return (
    <>
      {hiddenCount > 0 && (
        <p className="mb-3 font-mono text-[11px] text-ink-faint">
          Showing {run === "latest-abstain" ? "the abstain resolution" : "the latest resolution"} ({shown.length} steps) ·{" "}
          <span className="tabular-nums">{state.entries.length}</span> entries in the
          append-only ledger.
        </p>
      )}
      <ol className="relative space-y-2.5 border-l border-ink-12 pl-5">
        {shown.map((e, i) => {
        const meta = ACTION_META[e.action] ?? { dot: "bg-ink-30", label: e.action };
        const refused = REFUSAL.has(e.action);
        const isAbstain = e.action === "abstain";
        return (
          <li key={`${e.memoryId}-${i}`} className="row-in relative" style={{ animationDelay: `${i * 60}ms` }}>
            <span
              className={`absolute -left-[1.45rem] top-2 h-2.5 w-2.5 ${isAbstain ? "rounded-[2px] border border-dashed border-ice-45 bg-transparent" : `rounded-full ${meta.dot}`} ring-4 ring-[var(--void)]`}
              aria-hidden
            />
            <div
              className={`rounded-card border p-3 ${
                isAbstain
                  ? "border-dashed border-ice-45 bg-ice-10"
                  : refused
                    ? "border-ink-12 bg-surface-1"
                    : e.action === "decide"
                      ? "border-jade-25 bg-jade-12"
                      : "border-ink-08 bg-surface-1"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[12px] font-semibold uppercase tracking-[0.14em] ${
                      isAbstain ? "text-ice" : e.action === "decide" ? "text-jade" : refused ? "text-ink-dim" : "text-ink"
                    }`}
                  >
                    {meta.label}
                  </span>
                  {refused && (
                    <span className="rounded-chip border border-ink-12 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-ink-dim">
                      REFUSED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-ink-faint">
                  <span>{e.actor}</span>
                  <span className="tabular-nums">{fmtTime(e.timestamp)}</span>
                </div>
              </div>
              {(() => {
                const h = heroLine(e);
                return (
                  <div className="mt-1.5">
                    {h.main && (
                      <p
                        className={`text-[13px] font-medium leading-snug ${
                          isAbstain ? "text-ice" : e.action === "decide" ? "text-jade" : "text-ink"
                        }`}
                      >
                        {h.main}
                      </p>
                    )}
                    {h.sub && (
                      <p className="mono-data mt-0.5 text-[11px] leading-relaxed text-ink-dim">
                        {h.sub}
                      </p>
                    )}
                  </div>
                );
              })()}
              <details className="mt-1.5 group/raw">
                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink-dim">
                  raw entry
                </summary>
                <pre className="mono-data mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-chip border border-ink-08 bg-[oklch(13.5%_0.012_232)] p-2 text-[11px] leading-relaxed text-ink-dim">
                  {JSON.stringify(e.details, null, 2)}
                </pre>
              </details>
            </div>
          </li>
        );
        })}
      </ol>
    </>
  );
}
