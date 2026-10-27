// File: src/components/StreamedResolve.tsx
// C1 streamed hero: POST to /api/claim/resolve/stream and render the agent's reasoning loop LIVE as
// each ledger step arrives (probe -> discard -> federate -> vision -> reconcile -> verify -> decide),
// then surface the final decision. The stream is a VIEW of the persisted Trust Ledger (each line is a
// step the orchestrator already persisted), so what the judge watches IS the earned provenance.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Decision } from "@/core/types";
import { REPLAY_MODE } from "@/lib/replay";
import { ReplaySignpost } from "@/components/ReplaySignpost";

interface StreamStep {
  action: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

// Same visual language as the Trust Ledger timeline (one source of truth for action styling).
const ACTION_META: Record<string, { dot: string; label: string }> = {
  probe: { dot: "bg-accent", label: "Probe" },
  discard: { dot: "bg-ink-30", label: "Discard" },
  federate: { dot: "bg-accent-hi", label: "Federate" },
  vision: { dot: "bg-accent-hi", label: "Vision" },
  reconcile: { dot: "bg-ink-45", label: "Reconcile" },
  "gate-override": { dot: "bg-garnet", label: "Gate override" },
  decide: { dot: "bg-jade", label: "Decide" },
  abstain: { dot: "bg-ice", label: "Abstain" },
};
const REFUSAL = new Set(["discard", "abstain"]);

function detailLine(step: StreamStep): string {
  const d = step.details;
  if (step.action === "probe" || step.action === "discard") {
    return String(d.source ?? d.sourceId ?? "") + (d.reason ? ` · ${String(d.reason).slice(0, 90)}` : "");
  }
  if (step.action === "federate") return `rows: ${String(d.rowCount ?? "?")} · ${String(d.drivenBy ?? "")}`;
  if (step.action === "vision") {
    const v = (d.vision ?? {}) as Record<string, unknown>;
    return `read: ${Object.entries(v).map(([k, val]) => `${k}=${val}`).join(", ").slice(0, 120)}`;
  }
  if (step.action === "reconcile") return d.complete ? "facts complete" : `missing: ${String(d.missing ?? "")}`;
  if (step.action === "gate-override") return "engine-as-truth overrode the model verdict";
  return "";
}

type Phase = "idle" | "streaming" | "done" | "error";

export function StreamedResolve({
  claimId,
  imageDataUrl,
  reportDataUrl,
  onDone,
  onBusyChange,
  disabled = false,
}: {
  claimId: string;
  imageDataUrl?: string;
  reportDataUrl?: string;
  onDone?: (decision: Decision) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<StreamStep[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lifecycle refs: `alive` gates every setState so an unmount mid-stream can't update a dead
  // component; `ctrl`/`reader` let the unmount-cleanup abort the fetch + cancel the reader so the
  // server work and the ReadableStream don't leak during the 13-40s live resolve (MUST-FIX #2).
  const alive = useRef(true);
  const ctrlRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ctrlRef.current?.abort();
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  const run = useCallback(async () => {
    if (phase === "streaming" || disabled) return;
    onBusyChange?.(true);
    setPhase("streaming");
    setSteps([]);
    setDecision(null);
    setError(null);
    let sawDecision = false;
    let finalDecision: Decision | null = null;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const res = await fetch("/api/claim/resolve/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, imageDataUrl, reportDataUrl }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!alive.current) return; // unmounted mid-stream — stop touching state
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? ""; // keep the partial last line
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line) as
            | { type: "step"; step: StreamStep }
            | { type: "decision"; decision: Decision }
            | { type: "error"; error: string }
            | { type: "status"; attempt?: number }
            | { type: "retry"; attempt?: number };
          if (obj.type === "step") setSteps((s) => [...s, obj.step]);
          else if (obj.type === "decision") {
            // a decision line may carry undefined after exhausted retries — guard it (MUST-FIX #3)
            if (obj.decision) {
              setDecision(obj.decision);
              finalDecision = obj.decision;
              sawDecision = true;
            }
          } else if (obj.type === "error") throw new Error(obj.error);
          // A new attempt (retry, or status with attempt>1) means the server re-emits the chain
          // from the top — clear the stale steps so the money-shot renders ONE clean chain (MUST-FIX #1).
          else if (obj.type === "retry" || (obj.type === "status" && (obj.attempt ?? 1) > 1)) {
            setSteps([]);
          }
        }
      }
      if (!alive.current) return;
      if (!sawDecision) {
        // stream ended cleanly but produced no decision — never leave the judge on a silent blank
        setError("The stream ended without a decision. Click Resolve to retry.");
        setPhase("error");
      } else {
        setPhase("done");
        if (finalDecision) onDone?.(finalDecision);
      }
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    } finally {
      readerRef.current = null;
      ctrlRef.current = null;
      onBusyChange?.(false);
    }
  }, [phase, claimId, imageDataUrl, reportDataUrl, onDone, onBusyChange, disabled]);

  // Hosted demo is app-only: the live resolve stack is not reachable here, so present the signpost
  // instead of a control that would fail closed. Local dev (flag unset) keeps the full live stream.
  if (REPLAY_MODE) return <ReplaySignpost action="Resolve (watch it reason)" />;

  return (
    <section className="space-y-4">
      <button
        onClick={run}
        disabled={phase === "streaming" || disabled}
        className="rounded-chip bg-accent px-5 py-2 text-[13.5px] font-semibold text-[oklch(18%_0.02_75)] transition-colors duration-150 hover:bg-accent-hi active:bg-accent-deep disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-faint"
      >
        {phase === "streaming" ? "Sweeping the estate…" : "Resolve (watch it reason)"}
      </button>

      {error && (
        <p role="alert" className="card border-garnet-25 p-3 text-[13px] text-garnet">
          {error}
        </p>
      )}

      {steps.length > 0 && (
        <ol className="relative space-y-2 border-l border-ink-12 pl-5">
          {steps.map((step, i) => {
            const meta = ACTION_META[step.action] ?? { dot: "bg-ink-30", label: step.action };
            const refused = REFUSAL.has(step.action);
            const isAbstain = step.action === "abstain";
            const isLast = i === steps.length - 1 && phase === "streaming";
            return (
              <li key={`${step.timestamp}-${i}`} className="relative animate-[fadeIn_0.3s_ease-out]">
                <span
                  className={`absolute -left-[1.45rem] top-2 h-2.5 w-2.5 ${isAbstain ? "rounded-[2px] border border-dashed border-ice-45 bg-transparent" : `rounded-full ${meta.dot}`} ring-4 ring-[var(--void)] ${isLast ? "animate-pulse" : ""}`}
                  aria-hidden
                />
                <div
                  className={`rounded-card border px-3 py-2 ${
                    isAbstain
                      ? "border-dashed border-ice-45 bg-ice-10"
                      : refused
                        ? "border-ink-12 bg-surface-1"
                        : "border-ink-08 bg-surface-1"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`font-mono text-[12px] font-semibold uppercase tracking-[0.14em] ${
                        isAbstain ? "text-ice" : step.action === "decide" ? "text-jade" : refused ? "text-ink-dim" : "text-ink"
                      }`}
                    >
                      {meta.label}
                      {refused && (
                        <span className="ml-2 rounded-chip border border-ink-12 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-ink-dim">
                          REFUSED
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint">{step.actor}</span>
                  </div>
                  {detailLine(step) && (
                    <p className="mono-data mt-1 text-[11px] leading-relaxed text-ink-dim">{detailLine(step)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {decision && (
        <div
          className={`rounded-card border p-4 ${decision.verdict === "reserve" ? "border-jade-25 bg-jade-12" : "border-dashed border-ice-45 bg-ice-10"}`}
        >
          {decision.verdict === "reserve" ? (
            <>
              <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-jade">
                Reserve · ${decision.amount.toLocaleString()} {decision.currency}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-dim">{decision.basis}</p>
            </>
          ) : (
            <>
              <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-ice">
                Abstain · {decision.missing_fact}
              </p>
              <p className="mt-1.5 text-[13px] text-ink-dim">
                Resolve via: <span className="mono-data text-ink">{decision.resolving_source}</span>
              </p>
              <p className="mt-1 text-[12px] text-ink-faint">{decision.partial_basis}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
