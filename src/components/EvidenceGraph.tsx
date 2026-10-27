// File: src/components/EvidenceGraph.tsx
// C3 — interactive evidence-graph / lineage view over one claim's Trust Ledger. Pure VIEW over
// GET /api/ledger/[claimId] (reused) — no new source of truth. Three columns read left-to-right as a
// provenance chain:  DECISION BASIS (claims-of-fact)  →  SOURCE FACTS  →  LEDGER STEPS (producers).
// Click a basis sentence and its entire provenance chain lights up: the facts it cites, and the
// ledger steps that produced those facts. This is the "click a sentence, watch it light up" judge beat.
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildEvidenceGraph,
  type EvidenceGraph as Graph,
  type LedgerEntry,
} from "@/lib/evidence-graph";

// Resting-state lineage EDGES, drawn: sentence -> fact -> step as real curves in
// an overlay SVG, measured from the rendered nodes. The graph is an object with
// visible anatomy, not three adjacent lists; lit chains brighten their edges.
interface EdgeLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  from: string;
  to: string;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; graph: Graph };

// Slice the append-only entries down to ONE run (the one ending at the chosen
// terminal) so the graph tells the same story as the engine/timeline above it.
function runSlice(
  entries: LedgerEntry[],
  run: "latest" | "latest-abstain",
): LedgerEntry[] {
  const terminals: number[] = [];
  entries.forEach((e, i) => {
    if (e.action === "decide" || e.action === "abstain") terminals.push(i);
  });
  if (terminals.length === 0) return entries;
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

export function EvidenceGraph({
  claimId,
  run = "latest",
}: {
  claimId: string;
  run?: "latest" | "latest-abstain";
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [active, setActive] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<EdgeLine[]>([]);

  const setNodeRef = (id: string) => (el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  };

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
        const entries = runSlice((d.entries ?? []) as LedgerEntry[], run);
        setState({ status: "ready", graph: buildEvidenceGraph(claimId, entries) });
      })
      .catch((e) => alive && setState({ status: "error", message: String(e) }));
    return () => {
      alive = false;
    };
  }, [claimId, run]);

  // The lit provenance chain for the active sentence: the facts it cites + the steps producing them.
  const lit = useMemo(() => {
    const set = new Set<string>();
    if (state.status !== "ready" || !active) return set;
    set.add(active);
    for (const e of state.graph.edges) {
      if (e.kind === "cites" && e.from === active) {
        set.add(e.to);
        for (const e2 of state.graph.edges) {
          if (e2.kind === "producedBy" && e2.from === e.to) set.add(e2.to);
        }
      }
    }
    return set;
  }, [state, active]);

  // Measure the rendered nodes and lay the lineage edges over them. Re-measures
  // when the graph, the active chain, or the viewport width changes.
  useLayoutEffect(() => {
    if (state.status !== "ready") return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const wrapBox = wrap.getBoundingClientRect();
      const next: EdgeLine[] = [];
      for (const e of state.graph.edges) {
        if (e.kind !== "cites" && e.kind !== "producedBy") continue;
        const a = nodeRefs.current.get(e.from);
        const b = nodeRefs.current.get(e.to);
        if (!a || !b) continue;
        const ab = a.getBoundingClientRect();
        const bb = b.getBoundingClientRect();
        if (bb.left < ab.right) continue; // stacked single-column layout: skip edges
        next.push({
          x1: ab.right - wrapBox.left,
          y1: ab.top + ab.height / 2 - wrapBox.top,
          x2: bb.left - wrapBox.left,
          y2: bb.top + bb.height / 2 - wrapBox.top,
          from: e.from,
          to: e.to,
        });
      }
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [state, active]);

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-3 gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-flat h-40 animate-pulse" />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="card border-garnet-25 p-3 text-[13px] text-garnet">
        Could not load the evidence graph: {state.message}
      </p>
    );
  }

  const { graph } = state;
  const sentences = graph.nodes.filter((n) => n.kind === "sentence");
  const facts = graph.nodes.filter((n) => n.kind === "fact");
  const allSteps = graph.nodes.filter((n) => n.kind === "step");
  // Steps actually cited by the lineage render in the column; the rest (raw
  // probe noise) collapse behind a disclosure so the band stays balanced.
  const citedStepIds = new Set(
    graph.edges.filter((e) => e.kind === "producedBy").map((e) => e.to),
  );
  const steps = allSteps.filter((n) => citedStepIds.has(n.id));
  const restSteps = allSteps.filter((n) => !citedStepIds.has(n.id));
  const stepSource = (n: (typeof allSteps)[number]) => {
    const details = (n.meta?.details ?? {}) as Record<string, unknown>;
    const src = details.source ?? details.sourceId;
    if (src) return String(src);
    const actor = String(n.meta?.actor ?? "");
    return actor && actor !== String(n.meta?.action ?? "") ? actor : "";
  };
  // Only dim the off-chain nodes when the active sentence actually lit a DOWNSTREAM chain
  // (>1 node: itself + >=1 fact/step). A lone self-light (an orphan-ish sentence) would grey out
  // the whole graph and read as "nothing happened" on stage — treat it as a no-op (MUST-FIX #5).
  const chainLit = active != null && lit.size > 1;
  const dim = (id: string) => (chainLit && !lit.has(id) ? "opacity-30" : "opacity-100");

  if (sentences.length === 0) {
    return (
      <p className="card-flat p-4 text-[13px] text-ink-dim">
        No decided run to graph yet. Resolve the claim to populate the evidence lineage.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 font-mono text-[11px] text-ink-faint">
        Click a line of the decision; the facts it cites and the steps that produced them
        ignite (click again to clear). Verdict:{" "}
        <span className={graph.verdict === "reserve" ? "text-jade" : "text-ice"}>
          {graph.verdict.toUpperCase()}
        </span>
        .
      </p>
      <div ref={wrapRef} className="relative">
        {/* The lineage edges, drawn. Resting = faint hairlines; a lit chain's
            edges carry the lamp. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
          {lines.map((l, i) => {
            const isLit = chainLit && lit.has(l.from) && lit.has(l.to);
            const mx = (l.x1 + l.x2) / 2;
            return (
              <path
                key={i}
                d={`M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`}
                fill="none"
                stroke={isLit ? "var(--accent)" : "var(--ink-30)"}
                strokeWidth={isLit ? 1.5 : 1}
                opacity={chainLit && !isLit ? 0.3 : 1}
              />
            );
          })}
        </svg>
        <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Column 1 — decision-basis sentences (clickable claims-of-fact). */}
        <div>
          <h4 className="eyebrow mb-2 !text-ink-faint">decision basis</h4>
          <ul className="space-y-2">
            {sentences.map((n) => {
              const isActive = active === n.id;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    ref={setNodeRef(n.id)}
                    onClick={() => setActive(isActive ? null : n.id)}
                    className={`w-full rounded-card border p-3 text-left text-[13.5px] leading-snug transition duration-150 ${dim(n.id)} ${
                      isActive
                        ? "border-accent-50 bg-accent-12 text-ink"
                        : "border-ink-08 bg-surface-1 text-ink-dim hover:border-ink-18 hover:text-ink active:bg-ink-06"
                    }`}
                    aria-pressed={isActive}
                  >
                    {n.label.replace(/;\s*$/, "")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Column 2 — source facts cited. The unresolved fact is the cold spot. */}
        <div>
          <h4 className="eyebrow mb-2 !text-ink-faint">source facts</h4>
          <ul className="space-y-2">
            {facts.map((n) => {
              const resolved = n.meta?.resolved !== false;
              return (
                <li
                  key={n.id}
                  ref={setNodeRef(n.id)}
                  className={`rounded-card border p-3 text-[13.5px] leading-snug transition duration-150 ${dim(n.id)} ${
                    lit.has(n.id)
                      ? "border-accent-50 bg-accent-12 text-ink"
                      : resolved
                        ? "border-ink-08 bg-surface-1 text-ink-dim"
                        : "border-dashed border-ice-45 bg-ice-10 text-ice"
                  }`}
                >
                  {n.label.replace(/;\s*$/, "").replace(/\bnull\b/, "unresolved")}
                  {!resolved && (
                    <span className="ml-2 rounded-chip border border-dashed border-ice-45 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-ice">
                      COLD
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Column 3 — producing ledger steps. */}
        <div>
          <h4 className="eyebrow mb-2 !text-ink-faint">ledger steps</h4>
          <ul className="space-y-2">
            {steps.map((n) => (
              <li
                key={n.id}
                ref={setNodeRef(n.id)}
                className={`rounded-card border p-3 font-mono text-[11.5px] transition duration-150 ${dim(n.id)} ${
                  lit.has(n.id)
                    ? "border-accent-50 bg-accent-12 text-ink"
                    : "border-ink-08 bg-surface-1 text-ink-dim"
                }`}
              >
                <span className="font-semibold uppercase tracking-[0.12em]">
                  {String(n.meta?.action ?? n.label)}
                </span>
                <span className="ml-2 text-ink-faint">{stepSource(n)}</span>
              </li>
            ))}
          </ul>
          {restSteps.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink-dim">
                {restSteps.length} more steps in this run
              </summary>
              <ul className="mt-2 space-y-1.5">
                {restSteps.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-chip border border-ink-08 px-2.5 py-1.5 font-mono text-[10.5px] text-ink-faint"
                  >
                    <span className="font-semibold uppercase tracking-[0.12em]">
                      {String(n.meta?.action ?? n.label)}
                    </span>
                    <span className="ml-2">{stepSource(n)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
