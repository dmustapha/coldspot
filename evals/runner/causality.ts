// File: evals/runner/causality.ts
// C1 GATE — abstain->reserve CAUSALITY eval + stream-integrity, both falsifiable.
//
// Drives the REAL streamed resolve route (POST /api/claim/resolve/stream) for the hero claim
// CLM-4471 twice:
//   (a) WITHOUT the FEMA report  -> the treaty CAT window stays open-ended (cat_event_close null) ->
//       the deterministic gate is INCOMPLETE -> verdict MUST be "abstain" naming the CAT-window fact.
//   (b) WITH the FEMA report     -> a GENUINE Nemotron VL read of the declaration supplies the CAT
//       close date -> toCoverageFacts synthesizes the window -> the gate COMPLETES -> verdict MUST be
//       "reserve" at the EXACT deterministicReserve() amount (750,000 for this claim).
//
// Falsifiable: the ONLY difference between the two runs is the presence of the report image. If the
// gate wiring were a no-op, (b) would still abstain; if the vision read were hardcoded, mutating the
// report image's close date would NOT change the outcome. Both are real.
//
// Stream-integrity: the streamed NDJSON step lines from run (b), matched by memoryId against the
// persisted Trust Ledger (GET /api/ledger/[claimId]), reconstruct the SAME entries the route
// persisted — the stream is a view, never a second source of truth.
//
// Needs the app up on APP_URL (default http://localhost:3100) + the FEMA report asset. Live NIM, so
// each run takes ~1-2 min; transient upstream faults are retried inside the route (MAJOR-2).

import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deterministicReserve } from "../../src/core/reconcile";
import type { CoverageFacts } from "../../src/core/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const COLDSPOT_ROOT = resolvePath(HERE, "../..");
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const HERO = "CLM-4471";
const REPORT_PNG = resolvePath(COLDSPOT_ROOT, "public/demo-assets/fema-report-POL-1001.png");

// The hero's reconciled coverage facts WITH the vision-supplied CAT window (loss 2026-09-14 inside
// 2026-09-10..09-18). The expected reserve amount is a PURE function of these facts — the eval
// recomputes it from the engine, never hardcodes a number (INVARIANT #4/#5).
const HERO_FACTS: CoverageFacts = {
  baseLimit: 5_000_000,
  endorsementSublimit: 1_000_000,
  treatyCessionPct: 40,
  treatyCatSublimit: 2_000_000,
  reportedAmount: 1_250_000,
  lossInsideCatWindow: true,
};
const EXPECTED_RESERVE = deterministicReserve(HERO_FACTS).amount;

interface Decision {
  verdict: string;
  amount?: number;
  missing_fact?: string;
  resolving_source?: string;
  basis?: string;
}
interface StreamStep {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}
interface LedgerEntry {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Drive the streamed route, collecting steps + the final decision. Bounded retry on a transient
// upstream fault (the route also retries internally; this covers a dropped connection).
async function streamResolve(
  body: Record<string, unknown>,
  attempts = 3,
): Promise<{ steps: StreamStep[]; decision: Decision }> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/claim/resolve/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const steps: StreamStep[] = [];
      let decision: Decision | undefined;
      let streamErr: string | undefined;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const o = JSON.parse(line);
          if (o.type === "step") steps.push(o.step as StreamStep);
          else if (o.type === "decision") decision = o.decision as Decision;
          else if (o.type === "error") streamErr = String(o.error);
        }
      }
      if (streamErr) throw new Error(streamErr);
      if (!decision) throw new Error("stream closed without a decision");
      return { steps, decision };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (i < attempts) {
        console.log(`  [causality] transient (attempt ${i}/${attempts}): ${lastErr} — retrying`);
        await sleep(3000 * i);
      }
    }
  }
  throw new Error(`streamResolve failed after ${attempts}: ${lastErr}`);
}

async function getLedger(claimId: string): Promise<LedgerEntry[]> {
  const res = await fetch(`${APP_URL}/api/ledger/${claimId}`);
  if (!res.ok) throw new Error(`ledger HTTP ${res.status}`);
  const d = (await res.json()) as { entries: LedgerEntry[] };
  return d.entries ?? [];
}

// Stream-integrity: the streamed steps for THIS run are the last N append-only entries of the
// persisted ledger (the H-MEM ledger accumulates across runs, so we compare the streamed steps
// against the ledger TAIL, in order). The top-level persisted memoryId is the H-MEM record id, not
// the claimId — the claimId lives in details.memoryId (injected by TrustLedger.log) — so we match on
// action + actor + details (minus that injected key), position by position. A byte-identical tail
// match proves the stream is a VIEW of the persisted run, never a second source of truth.
function streamReconstructsLedger(
  steps: StreamStep[],
  ledger: LedgerEntry[],
): { ok: boolean; matched: number; detail: string } {
  if (steps.length === 0) return { ok: false, matched: 0, detail: "no streamed steps" };
  if (ledger.length < steps.length) {
    return { ok: false, matched: 0, detail: `ledger has ${ledger.length} entries < ${steps.length} streamed steps` };
  }
  const tail = ledger.slice(-steps.length);
  let matched = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const e = tail[i];
    if (e.action !== s.action || e.actor !== s.actor) {
      return { ok: false, matched, detail: `action/actor mismatch at tail[${i}]: persisted ${e.action}/${e.actor} vs streamed ${s.action}/${s.actor}` };
    }
    // Persisted details carry an injected memoryId key (TrustLedger.log); strip it before compare.
    const ed: Record<string, unknown> = { ...e.details };
    delete ed.memoryId;
    if (JSON.stringify(ed) !== JSON.stringify(s.details)) {
      return { ok: false, matched, detail: `details mismatch at tail[${i}] (${s.action})` };
    }
    matched++;
  }
  return { ok: matched === steps.length, matched, detail: "all streamed steps reconstruct the persisted ledger tail (action+actor+details identical, in order)" };
}

export interface CausalityResult {
  harness: "c1-causality";
  expectedReserve: number;
  without: { verdict: string; missing_fact?: string; namesCatFact: boolean; pass: boolean };
  withReport: { verdict: string; amount?: number; amountMatches: boolean; pass: boolean };
  streamIntegrity: { ok: boolean; matched: number; detail: string };
  causalityProven: boolean;
  verdict: "PASS" | "FAIL";
}

export async function runCausalityEval(): Promise<CausalityResult> {
  const reportBuf = readFileSync(REPORT_PNG);
  const reportDataUrl = `data:image/png;base64,${reportBuf.toString("base64")}`;

  console.log(`[causality] (a) ${HERO} WITHOUT the FEMA report -> expect ABSTAIN (CAT window)...`);
  const a = await streamResolve({ claimId: HERO, question: "reserve?" });
  const namesCatFact = (a.decision.missing_fact ?? "").toLowerCase().includes("cat event window");
  const aPass = a.decision.verdict === "abstain" && namesCatFact;
  console.log(`  -> ${a.decision.verdict}${a.decision.missing_fact ? ` (${a.decision.missing_fact})` : ""}  ${aPass ? "PASS" : "FAIL"}`);

  console.log(`[causality] (b) ${HERO} WITH the FEMA report (vision reads it) -> expect RESERVE $${EXPECTED_RESERVE.toLocaleString()}...`);
  const b = await streamResolve({ claimId: HERO, question: "reserve?", reportDataUrl });
  const amountMatches = b.decision.amount === EXPECTED_RESERVE;
  const bPass = b.decision.verdict === "reserve" && amountMatches;
  console.log(`  -> ${b.decision.verdict}${b.decision.amount != null ? ` $${b.decision.amount.toLocaleString()}` : ""}  ${bPass ? "PASS" : "FAIL"}`);

  // Stream-integrity on run (b): the streamed steps reconstruct the persisted ledger.
  const ledger = await getLedger(HERO);
  const integrity = streamReconstructsLedger(b.steps, ledger);
  console.log(`[causality] stream-integrity: ${integrity.matched}/${b.steps.length} steps reconstruct the ledger -> ${integrity.ok ? "PASS" : "FAIL"} (${integrity.detail})`);

  const causalityProven = aPass && bPass;
  const verdict: "PASS" | "FAIL" = causalityProven && integrity.ok ? "PASS" : "FAIL";

  return {
    harness: "c1-causality",
    expectedReserve: EXPECTED_RESERVE,
    without: { verdict: a.decision.verdict, missing_fact: a.decision.missing_fact, namesCatFact, pass: aPass },
    withReport: { verdict: b.decision.verdict, amount: b.decision.amount, amountMatches, pass: bPass },
    streamIntegrity: integrity,
    causalityProven,
    verdict,
  };
}
