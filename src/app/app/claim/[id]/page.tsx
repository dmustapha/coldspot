// File: src/app/app/claim/[id]/page.tsx  (/app/claim/[id] — the resolution surface)
// Intake + Scout routing line + vision upload + source tiles + decision + Trust Ledger.
// The resolve action: Scout routes the question, the orchestrator runs the real claim,
// then the tiles are re-derived from the ledger's probe/discard entries (earned, not authored).
"use client";

import { use, useCallback, useEffect, useState } from "react";
import { SiteNav } from "@/components/cold/Chrome";
import { ClaimThermogram } from "@/components/ClaimThermogram";
import { SourceTiles, type Tile } from "@/components/SourceTiles";
import { DecisionPanel } from "@/components/DecisionPanel";
import { TrustLedgerTimeline } from "@/components/TrustLedgerTimeline";
import { VisionUpload } from "@/components/VisionUpload";
import { StreamedResolve } from "@/components/StreamedResolve";
import { RecomputePanel } from "@/components/RecomputePanel";
import { EvidenceGraph } from "@/components/EvidenceGraph";
import { ReplaySignpost } from "@/components/ReplaySignpost";
import { REPLAY_MODE } from "@/lib/replay";
import type { Decision } from "@/core/types";

interface Routing {
  intent: string;
  workflow: string;
  score: number;
  risk?: { level: string; reason?: string };
}

interface LedgerEntry {
  action: string;
  details: Record<string, unknown>;
}

// Re-derive the 4 source tiles from the ledger's probe/discard entries. Each probe/discard
// entry's details carry the ProbeResult (sourceId, relevant, reason, score) — so the tiles
// reflect what the agent actually probed and refused, never a hardcoded list.
function tilesFromLedger(entries: LedgerEntry[]): Tile[] {
  const byId = new Map<string, Tile>();
  for (const e of entries) {
    if (e.action !== "probe" && e.action !== "discard") continue;
    const d = e.details;
    const sourceId = String(d.sourceId ?? d.source ?? "");
    if (!sourceId) continue;
    const relevant = Boolean(d.relevant);
    byId.set(sourceId, {
      sourceId,
      label: String(d.label ?? sourceId),
      status: e.action === "discard" || !relevant ? "discarded" : "relevant",
      reason: typeof d.reason === "string" ? d.reason : undefined,
      score: typeof d.score === "number" ? d.score : undefined,
    });
  }
  return [...byId.values()];
}

export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [question, setQuestion] = useState(
    `What should we reserve on claim ${id}?`,
  );
  const [image, setImage] = useState<string | undefined>();
  const [report, setReport] = useState<string | undefined>();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamBusy, setStreamBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledgerKey, setLedgerKey] = useState(0); // bump to force a timeline refetch

  const loadTiles = useCallback(async () => {
    try {
      const led = await (await fetch(`/api/ledger/${id}`)).json();
      setTiles(tilesFromLedger(led.entries ?? []));
    } catch {
      /* tiles are best-effort; the ledger timeline is the source of truth */
    }
  }, [id]);

  // Pre-populate tiles + timeline from any pre-run ledger on first load.
  useEffect(() => {
    loadTiles();
  }, [loadTiles]);

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      // 1. Scout routes the question (visible routing — O3). Guarded: an error
      // payload must never reach render (routing.score.toFixed would throw).
      const r = await fetch("/api/intent/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: question }),
      });
      const routed = await r.json().catch(() => null);
      if (r.ok && routed && typeof routed.score === "number") setRouting(routed);

      // 2. The orchestrator runs the real claim against the live sources.
      const res = await fetch("/api/claim/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId: id, question, imageDataUrl: image, reportDataUrl: report }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `resolve failed (${res.status})`);
      setDecision(data.decision);

      // 3. Re-derive tiles + refresh the ledger timeline from the earned entries.
      await loadTiles();
      setLedgerKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteNav active="app" />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        <div>
          <p className="eyebrow">resolution surface</p>
          <h1 className="mt-2 flex items-baseline gap-3">
            <span className="display text-[26px] text-ink">Claim</span>
            <span className="mono-data text-[24px] font-semibold text-accent">{id}</span>
          </h1>
        </div>

        {/* The claim's thermogram: its current state on the ledger, frame-0. */}
        <ClaimThermogram key={`tg-${ledgerKey}`} claimId={id} />

        {/* Intake */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Question to the claims agent"
            className="card-flat flex-1 px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint"
            placeholder="Ask the agent about this claim…"
          />
          <button
            onClick={resolve}
            disabled={busy || streamBusy || REPLAY_MODE}
            className="rounded-chip bg-accent px-5 py-2 text-[13.5px] font-semibold text-[oklch(18%_0.02_75)] transition-colors duration-150 hover:bg-accent-hi active:bg-accent-deep disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-faint"
          >
            {busy ? "Resolving…" : "Resolve"}
          </button>
        </div>

        {REPLAY_MODE && <ReplaySignpost action="Resolve" />}

        {/* Scout routing line (O3: routing is visible) */}
        {routing && (
          <div className="card-flat px-3.5 py-2 font-mono text-[12px] text-ink-dim">
            <span className="text-ink-faint">scout routed →</span>{" "}
            <span className="text-ink">{routing.intent}</span>
            {" · "}
            <span className="text-ink-dim">{routing.workflow}</span>
            {" · score "}
            <span className="tabular-nums text-accent">{routing.score.toFixed(2)}</span>
            {routing.risk && (
              <span className="ml-1 text-ink-faint">· risk {routing.risk.level}</span>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="card border-garnet-25 p-3 text-[13px] text-garnet">
            {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <VisionUpload
            onImage={setImage}
            id="damage-upload"
            label="Damage evidence"
            hint="(damage photo or repair invoice · optional)"
          />
          {/* C1 FEMA-report upload: the vision read of this declaration supplies the
              CAT-window fact that resolves the hero's abstain -> reserve. */}
          <VisionUpload
            onImage={setReport}
            id="fema-upload"
            label="FEMA / NOAA declaration"
            hint="(the declaration the agent reads for the CAT-window fact)"
          />
        </div>

        {/* Streamed hero: watch the agent reason live, step by step. */}
        <section>
          <h2 className="eyebrow mb-2.5 !text-ink-faint">resolve · live reasoning stream</h2>
          <StreamedResolve
            claimId={id}
            imageDataUrl={image}
            reportDataUrl={report}
            disabled={busy}
            onBusyChange={setStreamBusy}
            onDone={() => {
              loadTiles();
              setLedgerKey((k) => k + 1);
            }}
          />
        </section>

        <section>
          <h2 className="eyebrow mb-2.5 !text-ink-faint">candidate sources</h2>
          <SourceTiles tiles={tiles} />
        </section>

        <DecisionPanel decision={decision} />

        {/* C4.1 auditable reserving: re-derive the stored decision from live sources and diff it. */}
        <section>
          <h2 className="eyebrow mb-2.5 !text-ink-faint">auditable reserving · re-derive from live sources</h2>
          <RecomputePanel claimId={id} imageDataUrl={image} reportDataUrl={report} />
        </section>

        <section>
          <h2 className="font-display text-[18px] font-700 text-ink" style={{ fontWeight: 700 }}>
            Trust Ledger
          </h2>
          <p className="mb-3 mt-1 font-mono text-[11px] text-ink-faint">
            the append-only record of what the agent used, and what it refused
          </p>
          <TrustLedgerTimeline key={ledgerKey} claimId={id} />
        </section>

        <section>
          <h2 className="font-display text-[18px] font-700 text-ink" style={{ fontWeight: 700 }}>
            Evidence graph
          </h2>
          <p className="mb-3 mt-1 font-mono text-[11px] text-ink-faint">
            every line of the decision traces to the fact it cites and the step that produced it
          </p>
          <EvidenceGraph key={`eg-${ledgerKey}`} claimId={id} />
        </section>
      </main>
    </>
  );
}
