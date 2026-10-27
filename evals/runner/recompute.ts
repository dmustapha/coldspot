// File: evals/runner/recompute.ts
// C4 GATE — recompute-determinism eval (MAJOR-1 as a demoed product feature), both assertions
// falsifiable:
//   (a) STABLE: recomputing a stable estate (CLM-7781, no mutated input) re-derives IDENTICALLY
//       (diff.identical === true) — the same loop over the same live sources earns the same verdict.
//   (b) MUTATED: supplying the FEMA report image to the hero (CLM-4471, stored = ABSTAIN on the
//       CAT-window gap) makes the vision read supply the missing CAT window -> the gate resolves ->
//       the fresh decision RESERVES. The diff must be NON-identical with the EXPECTED changed field
//       (verdict: abstain -> reserve). Mutate nothing and (b) would stay identical; the eval fails.
//
// Drives the REAL recompute route (POST /api/claim/[id]/recompute) which reuses resolveClaimShared,
// so it re-derives from source — never reads a cached artifact. Needs the app up on APP_URL.

import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";

interface FieldChange { field: string; from: unknown; to: unknown }
interface DecisionDiff { identical: boolean; changes: FieldChange[] }
interface RecomputeResponse {
  stored: { verdict: string; amount?: number };
  recomputed: { verdict: string; amount?: number };
  diff: DecisionDiff;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Establish a KNOWN stored baseline: resolve the claim with the given inputs so the LAST persisted
// decision is deterministic before we recompute+diff. (The recompute itself appends a run, so the
// mutated case must not rely on an incidental prior stored state — it seeds its own abstain first.)
async function seedBaseline(
  claimId: string,
  body: Record<string, unknown>,
  attempts = 3,
): Promise<void> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/claim/resolve/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, ...body }),
      });
      if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sawDecision = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const o = JSON.parse(line);
          if (o.type === "decision") sawDecision = true;
          else if (o.type === "error") throw new Error(String(o.error));
        }
      }
      if (!sawDecision) throw new Error("stream closed without a decision");
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (i < attempts) {
        console.log(`  [recompute] baseline transient (${i}/${attempts}): ${lastErr} — retrying`);
        await sleep(3000 * i);
      }
    }
  }
  throw new Error(`seedBaseline(${claimId}) failed after ${attempts}: ${lastErr}`);
}

async function recompute(
  claimId: string,
  body: Record<string, unknown>,
  attempts = 3,
): Promise<RecomputeResponse> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/claim/${claimId}/recompute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as RecomputeResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `recompute HTTP ${res.status}`);
      return data;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (i < attempts) {
        console.log(`  [recompute] transient (attempt ${i}/${attempts}): ${lastErr} — retrying`);
        await sleep(3000 * i);
      }
    }
  }
  throw new Error(`recompute(${claimId}) failed after ${attempts}: ${lastErr}`);
}

function reportDataUrl(): string {
  const png = readFileSync(resolvePath(ROOT, "public/demo-assets/fema-report-POL-1001.png"));
  return `data:image/png;base64,${png.toString("base64")}`;
}

export interface RecomputeEvalResult {
  harness: "recompute-determinism";
  stable: { claim: string; identical: boolean; changes: number };
  mutated: { claim: string; identical: boolean; expectedField: string; changedFields: string[]; verdictFrom: string; verdictTo: string };
  verdict: "PASS" | "FAIL";
}

export async function runRecomputeEval(): Promise<RecomputeEvalResult> {
  // (a) STABLE — seed a deterministic reserve baseline, then recompute with the SAME (no) inputs:
  // it must re-derive identically (MAJOR-1).
  console.log("[recompute] (a) STABLE CLM-7781 — seeding baseline + re-deriving (expect identical) ...");
  await seedBaseline("CLM-7781", {});
  const stable = await recompute("CLM-7781", {});
  const stablePass = stable.diff.identical === true;
  console.log(`  [recompute] stable identical=${stable.diff.identical} changes=${stable.diff.changes.length}`);

  // (b) MUTATED — seed the hero's natural ABSTAIN baseline (no report => CAT window unresolved),
  // then recompute WITH the FEMA report so the vision read supplies the window -> reserve. The diff
  // must be non-identical with the verdict Δ. (Seeding first makes this order-independent: the stored
  // decision is a known abstain regardless of any prior recompute run.)
  console.log("[recompute] (b) MUTATED CLM-4471 — seeding ABSTAIN baseline + re-deriving with FEMA report (expect verdict Δ) ...");
  await seedBaseline("CLM-4471", {});
  const mutated = await recompute("CLM-4471", { reportDataUrl: reportDataUrl() });
  const changedFields = mutated.diff.changes.map((c) => c.field);
  const EXPECTED = "verdict";
  const mutatedPass =
    mutated.diff.identical === false &&
    changedFields.includes(EXPECTED) &&
    mutated.stored.verdict === "abstain" &&
    mutated.recomputed.verdict === "reserve";
  console.log(
    `  [recompute] mutated identical=${mutated.diff.identical} verdict ${mutated.stored.verdict} -> ${mutated.recomputed.verdict} fields=[${changedFields.join(", ")}]`,
  );

  const verdict: "PASS" | "FAIL" = stablePass && mutatedPass ? "PASS" : "FAIL";
  return {
    harness: "recompute-determinism",
    stable: { claim: "CLM-7781", identical: stable.diff.identical, changes: stable.diff.changes.length },
    mutated: {
      claim: "CLM-4471",
      identical: mutated.diff.identical,
      expectedField: EXPECTED,
      changedFields,
      verdictFrom: mutated.stored.verdict,
      verdictTo: mutated.recomputed.verdict,
    },
    verdict,
  };
}

// Standalone entry: `npm run recompute:eval`. Writes the same evidence artifact and exits non-zero
// on FAIL so it is a real gate.
async function main(): Promise<void> {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const rc = await runRecomputeEval();
  const outDir = resolvePath(ROOT, "evidence");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolvePath(outDir, "c4-recompute-eval.json"),
    JSON.stringify({ ...rc, ts: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`VERDICT ${rc.verdict}  (artifact: evidence/c4-recompute-eval.json)`);
  if (rc.verdict !== "PASS") process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("recompute.ts")) {
  main().catch((e) => {
    console.error("RECOMPUTE_EVAL_ERROR", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
