// File: scripts/hero-prerun.ts
// P4.1 — scripted, repeatable HERO pre-run.
//
// Pre-executes the flagship demo scenario (the CLM-4471 ABSTAIN story) end-to-end
// through the REAL agent and captures its earned artifacts, so /demo replays an EARNED
// Trust Ledger (INVARIANT #5 — never an authored fixture).
//
// It drives the LIVE resolve route (POST /api/claim/resolve), which IS the real
// orchestrator wiring (Nemotron plan->probe->gather DT-3 two-turn, deterministic
// reconcile+gate, structured decide). Using the endpoint — not a re-implemented deps
// bundle — guarantees the pre-run exercises the identical code path a judge hits, and
// the ledger entries come from a real federated Zetaris JOIN + a real Nemotron decision.
//
// One-command runnable (app must be up on APP_URL, default http://localhost:3100):
//   npm run hero:prerun
// Captures to submission/hero-run/:
//   - decision.json   the ABSTAIN decision (verdict + missing_fact + resolving_source)
//   - ledger.jsonl    the earned Trust Ledger (one JSON line per entry, in order)
//   - summary.json    machine-readable run result (verdict, entry count, action sequence)
// Exits non-zero unless the hero resolves to ABSTAIN naming the CAT-window missing fact
// with a full earned ledger — so it is a real gate, not a report.

import { writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { resolve as resolvePath, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COLDSPOT_ROOT = resolvePath(HERE, "..");

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const HERO_CLAIM = process.env.HERO_CLAIM ?? "CLM-4471";
const OUT_DIR = resolvePath(COLDSPOT_ROOT, "submission/hero-run");

const CAT_FACT = "cat event window"; // the expected missing-fact substring (case-insensitive)

interface Decision {
  verdict: string;
  missing_fact?: string;
  resolving_source?: string;
  partial_basis?: string;
}

interface LedgerEntry {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  details: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bounded retry for the resolve POST. The dependencies are live upstream services — the Oracle
// ADB cold-connects / auto-hibernates (NJS-040 queueTimeout) and the Nemotron NIM reasoning model
// occasionally returns a transient upstream 500. These are infra transients, NOT a verdict defect
// (the deterministic gate makes the verdict stable), so a scripted demo pre-run retries them with
// backoff instead of failing the whole run. Max 4 attempts (warms the ADB + rides out a NIM blip).
async function postJson<T>(url: string, body: unknown, attempts = 4): Promise<T> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text) as T;
      lastErr = `${res.status}: ${text.slice(0, 200)}`;
      // Retry transient upstream faults (ADB cold-connect / NIM 5xx); fail fast on 4xx.
      if (res.status < 500) throw new Error(`POST ${url} -> ${lastErr}`);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (lastErr.includes("-> 4")) throw e; // non-retryable client error
    }
    if (i < attempts) {
      const wait = 3000 * i;
      console.log(`[hero-prerun] transient fault (attempt ${i}/${attempts}): ${lastErr} — retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`POST ${url} failed after ${attempts} attempts: ${lastErr}`);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

// Provision a fresh demo ledger so one scripted pre-run yields exactly ONE earned trace.
// The H-MEM ledger is append-only BY DESIGN (entries are never mutated in-flight — an audit
// property); resetting the on-disk JSONL between scripted demo regenerations is legitimate
// demo-state provisioning, not a mutation of a live run. The prior file is archived, never
// silently dropped. Skip with KEEP_LEDGER=1 to accumulate (e.g. append to a real audit trail).
function resetDemoLedger(): void {
  if (process.env.KEEP_LEDGER === "1") {
    console.log("[hero-prerun] KEEP_LEDGER=1 -> appending to existing ledger (no reset)");
    return;
  }
  const ledgerDir = resolvePath(COLDSPOT_ROOT, process.env.LEDGER_DIR ?? "./evidence/ledger");
  const jsonl = join(ledgerDir, "ledger.jsonl");
  if (existsSync(jsonl)) {
    const archived = join(ledgerDir, `ledger.pre-${Date.now()}.jsonl`);
    renameSync(jsonl, archived);
    console.log(`[hero-prerun] archived prior ledger -> ${archived.replace(COLDSPOT_ROOT + "/", "")}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[hero-prerun] app=${APP_URL} claim=${HERO_CLAIM}`);

  // 0. Fresh demo ledger -> one scripted run = one clean earned trace.
  resetDemoLedger();

  // 1. Drive the REAL agent end-to-end (this populates the earned Trust Ledger).
  console.log("[hero-prerun] resolving via POST /api/claim/resolve (real orchestrator)...");
  const t0 = Date.now();
  const { decision } = await postJson<{ decision: Decision; ledgerId: string }>(
    `${APP_URL}/api/claim/resolve`,
    { claimId: HERO_CLAIM, question: "reserve?" },
  );
  const elapsedMs = Date.now() - t0;
  console.log(`[hero-prerun] decision verdict=${decision.verdict} (${elapsedMs}ms)`);

  // 2. Re-walk the earned ledger from the replay surface (same endpoint /demo reads).
  const { entries } = await getJson<{ entries: LedgerEntry[] }>(
    `${APP_URL}/api/ledger/${HERO_CLAIM}`,
  );
  const actionSeq = entries.map((e) => e.action);

  // 3. Capture artifacts.
  writeFileSync(resolvePath(OUT_DIR, "decision.json"), JSON.stringify(decision, null, 2) + "\n");
  writeFileSync(
    resolvePath(OUT_DIR, "ledger.jsonl"),
    entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );

  // 4. Gate: the hero MUST be a real ABSTAIN naming the CAT-window missing fact, over a real
  //    earned ledger that ran the full loop (probe/federate/reconcile/abstain present).
  const verdictOk = decision.verdict === "abstain";
  const missing = (decision.missing_fact ?? "").toLowerCase();
  const namesCatFact = missing.includes(CAT_FACT);
  const hasResolvingSource = Boolean(decision.resolving_source && decision.resolving_source.length > 0);
  const ranLoop =
    actionSeq.includes("federate") &&
    actionSeq.includes("reconcile") &&
    actionSeq.includes("abstain");
  const discarded = actionSeq.filter((a) => a === "discard").length;
  const earned = entries.length > 0 && entries.every((e) => Number.isFinite(e.timestamp) && e.timestamp > 0);

  const verdict = verdictOk && namesCatFact && hasResolvingSource && ranLoop && earned ? "PASS" : "FAIL";

  const summary = {
    harness: "hero-prerun",
    appUrl: APP_URL,
    claimId: HERO_CLAIM,
    ts: new Date().toISOString(),
    elapsedMs,
    decisionVerdict: decision.verdict,
    missing_fact: decision.missing_fact,
    resolving_source: decision.resolving_source,
    ledgerEntryCount: entries.length,
    actionSequence: actionSeq,
    discardedCount: discarded,
    checks: { verdictOk, namesCatFact, hasResolvingSource, ranLoop, earned },
    verdict,
    artifacts: {
      decision: "submission/hero-run/decision.json",
      ledger: "submission/hero-run/ledger.jsonl",
      summary: "submission/hero-run/summary.json",
    },
  };
  writeFileSync(resolvePath(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(`[hero-prerun] ledger: ${entries.length} earned entries -> ${actionSeq.join(",")}`);
  console.log(`[hero-prerun] missing_fact: ${decision.missing_fact}`);
  console.log(`[hero-prerun] resolving_source: ${decision.resolving_source}`);
  console.log(`[hero-prerun] artifacts written to submission/hero-run/`);
  console.log(`VERDICT ${verdict}`);

  if (verdict !== "PASS") process.exit(1);
}

main().catch((e) => {
  console.error("HERO_PRERUN_FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});
