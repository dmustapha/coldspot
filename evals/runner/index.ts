// File: evals/runner/index.ts
// P2.3 — Scout formal eval harness.
//
// Repeatable eval that proves the authored-to-contract Scout actually routes the
// 3 documented workflows (reserve-decide / coverage-check / abstain-triage) over a
// set of LABELED natural-language intake cases. It runs the REAL Scout.route() for
// each case (no mocked routing), scores exact-workflow accuracy + band behavior, and
// emits a machine-readable results artifact to evidence/scout-eval.json.
//
// One-command runnable:
//   SCOUT_IMPL=./src/adapters/meterless/scout.ts npm run evals
// SCOUT_IMPL is honored for parity with the documented repo-harness contract (D7); it
// defaults to the authored Scout so the eval runs with zero env. The harness exits
// non-zero on ANY misroute so it is a real gate, not a report.
//
// NOTE (INVARIANT #3 spirit): the expected answers live in evals/scout-cases.json and
// are compared against the Scout's OWN output — the classifier never sees the labels.
// Mutate a case's prompt and the routing changes; the harness is falsifiable.

import { readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve as resolvePath, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCausalityEval } from "./causality";
import { runC2Eval } from "./c2-reasoning";
import { runC3DiscoveryEval } from "./c3-discovery";
import { runRecomputeEval } from "./recompute";

const HERE = dirname(fileURLToPath(import.meta.url));
const COLDSPOT_ROOT = resolvePath(HERE, "../..");

interface EvalCase {
  id: string;
  prompt: string;
  expectWorkflow: string;
  expectBand: "HIGH" | "MED" | "LOW";
  expectClaimId?: string;
}

interface CaseResult {
  id: string;
  prompt: string;
  expectWorkflow: string;
  gotWorkflow: string;
  score: number;
  band: string;
  expectBand: string;
  claimIdOk: boolean;
  pass: boolean;
}

// Band label from the raw top score (mirrors Scout BANDS: HIGH 0.8 / MED 0.55 / LOW 0.4).
function bandOf(score: number): "HIGH" | "MED" | "LOW" | "NONE" {
  if (score >= 0.8) return "HIGH";
  if (score >= 0.55) return "MED";
  if (score >= 0.4) return "LOW";
  return "NONE";
}

type RouteResult = { workflow: string; intent: string; score: number; claimContext?: { claimId: string } };
type ScoutClass = new () => { route(t: string): Promise<RouteResult> | RouteResult };

async function loadScout(): Promise<ScoutClass> {
  // SCOUT_IMPL points at a module exporting `Scout`; default to the authored impl.
  const implRef = process.env.SCOUT_IMPL ?? "./src/adapters/meterless/scout.ts";
  const abs = isAbsolute(implRef) ? implRef : resolvePath(COLDSPOT_ROOT, implRef);
  const mod = (await import(pathToFileURL(abs).href)) as { Scout?: ScoutClass };
  if (!mod.Scout) {
    throw new Error(`SCOUT_IMPL (${implRef}) does not export a Scout class`);
  }
  return mod.Scout;
}

async function runScoutEval(): Promise<"PASS" | "FAIL"> {
  const casesPath = resolvePath(COLDSPOT_ROOT, "evals/scout-cases.json");
  const { cases } = JSON.parse(readFileSync(casesPath, "utf8")) as { cases: EvalCase[] };

  const Scout = await loadScout();
  const scout = new Scout();

  // route() delegates to the REAL vendored Scout engine, whose decide() is async — await each case.
  const results: CaseResult[] = await Promise.all(cases.map(async (c) => {
    const r = await scout.route(c.prompt);
    const workflowOk = r.workflow === c.expectWorkflow;
    const band = bandOf(r.score);
    const bandOk = band === c.expectBand;
    const claimIdOk = c.expectClaimId ? r.claimContext?.claimId === c.expectClaimId : true;
    return {
      id: c.id,
      prompt: c.prompt,
      expectWorkflow: c.expectWorkflow,
      gotWorkflow: r.workflow,
      score: Number(r.score.toFixed(3)),
      band,
      expectBand: c.expectBand,
      claimIdOk,
      // HARD gate: exact workflow + the documented band behavior + claim-id parse must all match.
      // Bands are calibrated to the deterministic classifier, so a registry change that shifts a
      // band is a real regression the harness must catch.
      pass: workflowOk && bandOk && claimIdOk,
    };
  }));

  // Falsifiability self-check (INVARIANT #3 spirit): mutating a prompt to a different intent's
  // vocabulary MUST change the routed workflow — proves the classifier reads the text, not the label.
  const falsCase = cases.find((c) => c.expectWorkflow === "reserve-decide");
  let falsifiable = true;
  if (falsCase) {
    const mutated = await scout.route("is this damage covered under the policy exclusion");
    falsifiable = mutated.workflow === "coverage-check" && mutated.workflow !== falsCase.expectWorkflow;
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const bandMatches = results.filter((r) => r.band === r.expectBand).length;
  const byWorkflow = (["reserve-decide", "coverage-check", "abstain-triage"] as const).map((w) => {
    const sub = results.filter((r) => r.expectWorkflow === w);
    return { workflow: w, cases: sub.length, routed: sub.filter((r) => r.pass).length };
  });
  const accuracy = passed / total;
  const verdict = passed === total && falsifiable ? "PASS" : "FAIL";

  const artifact = {
    harness: "scout-eval",
    scoutImpl: process.env.SCOUT_IMPL ?? "./src/adapters/meterless/scout.ts",
    ts: new Date().toISOString(),
    total,
    passed,
    accuracy: Number(accuracy.toFixed(3)),
    bandMatches,
    falsifiable,
    byWorkflow,
    verdict,
    results,
  };

  const outDir = resolvePath(COLDSPOT_ROOT, "evidence");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolvePath(outDir, "scout-eval.json"), JSON.stringify(artifact, null, 2) + "\n");

  // Human-readable console report.
  console.log(`evals: ${passed}/${total} workflows routed correctly (accuracy ${(accuracy * 100).toFixed(0)}%)`);
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    console.log(
      `  [${r.id}] "${r.prompt}"\n        -> ${r.gotWorkflow} (score ${r.score}, ${r.band})  expect ${r.expectWorkflow}/${r.expectBand}  ${mark}`,
    );
  }
  console.log(`  per-workflow: ${byWorkflow.map((b) => `${b.workflow} ${b.routed}/${b.cases}`).join(" | ")}`);
  console.log(`  band matches: ${bandMatches}/${total}`);
  console.log(`  falsifiable (mutate prompt -> route changes): ${falsifiable ? "YES" : "NO"}`);
  console.log(`VERDICT ${verdict}  (artifact: evidence/scout-eval.json)`);
  return verdict;
}

// Run the full eval suite: Scout routing (fast, offline) + C1 abstain->reserve causality
// (live, needs the app up). SKIP_CAUSALITY=1 runs only the offline Scout eval (e.g. pure-CI).
async function main(): Promise<void> {
  const scoutVerdict = await runScoutEval();

  let causalityVerdict: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  if (process.env.SKIP_CAUSALITY === "1") {
    console.log("\n[causality] SKIP_CAUSALITY=1 -> skipping the live C1 causality eval");
  } else {
    console.log("\n=== C1 abstain->reserve causality + stream-integrity (live) ===");
    try {
      const c = await runCausalityEval();
      const outDir = resolvePath(COLDSPOT_ROOT, "evidence");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolvePath(outDir, "c1-causality-eval.json"),
        JSON.stringify({ ...c, ts: new Date().toISOString() }, null, 2) + "\n",
      );
      causalityVerdict = c.verdict;
      console.log(`CAUSALITY VERDICT ${c.verdict}  (artifact: evidence/c1-causality-eval.json)`);
    } catch (e) {
      console.error("C1_CAUSALITY_EVAL_FAILED", e instanceof Error ? e.message : e);
      causalityVerdict = "FAIL";
    }
  }

  // C2 reasoning-architecture evals (live): VERIFY-agreement + counterfactual-correctness +
  // Markovian bound. SKIP_CAUSALITY=1 also skips these (they need the app up, same as causality).
  let c2Verdict: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  if (process.env.SKIP_CAUSALITY === "1") {
    console.log("\n[c2] SKIP_CAUSALITY=1 -> skipping the live C2 reasoning evals");
  } else {
    console.log("\n=== C2 VERIFY-agreement + counterfactual-correctness + Markovian bound (live) ===");
    try {
      const c2 = await runC2Eval();
      const outDir = resolvePath(COLDSPOT_ROOT, "evidence");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolvePath(outDir, "c2-reasoning-eval.json"),
        JSON.stringify({ ...c2, ts: new Date().toISOString() }, null, 2) + "\n",
      );
      c2Verdict = c2.verdict;
      console.log(
        `C2 VERDICT ${c2.verdict}  (verify-all-agree=${c2.verifyAllAgree} counterfactual-all-match=${c2.counterfactualAllMatch} markovian-constant=${c2.markovianBound.constant}; artifact: evidence/c2-reasoning-eval.json)`,
      );
    } catch (e) {
      console.error("C2_REASONING_EVAL_FAILED", e instanceof Error ? e.message : e);
      c2Verdict = "FAIL";
    }
  }

  // C3 source-discovery eval (live): breadth >=5 types + decoy discard (signal-derived) +
  // confirmed-only federation + falsifiability. Same gating as causality/c2 (needs the app up).
  let c3Verdict: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  if (process.env.SKIP_CAUSALITY === "1") {
    console.log("\n[c3] SKIP_CAUSALITY=1 -> skipping the live C3 source-discovery eval");
  } else {
    console.log("\n=== C3 source-discovery: breadth + decoy-discard + confirmed-only federation (live) ===");
    try {
      const c3 = await runC3DiscoveryEval();
      const outDir = resolvePath(COLDSPOT_ROOT, "evidence");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolvePath(outDir, "c3-discovery-eval.json"),
        JSON.stringify({ ...c3, ts: new Date().toISOString() }, null, 2) + "\n",
      );
      c3Verdict = c3.verdict;
      console.log(
        `  types probed: ${c3.typesProbed}/${c3.catalogTypes} · decoy discarded=${c3.decoyDiscarded} (signal-derived=${c3.decoyReasonSignalDerived}) · only-confirmed-federated=${c3.onlyConfirmedFederated} · falsifiable=${c3.falsifiable}`,
      );
      console.log(`  decoy reason: "${c3.decoyReason}"`);
      console.log(`  federated: [${c3.federatedNames.join(", ")}]  confirmed: [${c3.confirmedNames.join(", ")}]`);
      console.log(`C3 VERDICT ${c3.verdict}  (artifact: evidence/c3-discovery-eval.json)`);
    } catch (e) {
      console.error("C3_DISCOVERY_EVAL_FAILED", e instanceof Error ? e.message : e);
      c3Verdict = "FAIL";
    }
  }

  // C4 recompute-determinism eval (live): stable re-derives identically + a mutated source surfaces
  // the expected field Δ. Same gating as causality/c2/c3 (needs the app up + a prior stored decision).
  let recomputeVerdict: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  if (process.env.SKIP_CAUSALITY === "1") {
    console.log("\n[recompute] SKIP_CAUSALITY=1 -> skipping the live C4 recompute-determinism eval");
  } else {
    console.log("\n=== C4 recompute-determinism: stable re-derives identically + mutated surfaces a Δ (live) ===");
    try {
      const rc = await runRecomputeEval();
      const outDir = resolvePath(COLDSPOT_ROOT, "evidence");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolvePath(outDir, "c4-recompute-eval.json"),
        JSON.stringify({ ...rc, ts: new Date().toISOString() }, null, 2) + "\n",
      );
      recomputeVerdict = rc.verdict;
      console.log(
        `  stable ${rc.stable.claim}: identical=${rc.stable.identical} · mutated ${rc.mutated.claim}: ${rc.mutated.verdictFrom}->${rc.mutated.verdictTo} (Δ fields [${rc.mutated.changedFields.join(", ")}])`,
      );
      console.log(`C4 VERDICT ${rc.verdict}  (artifact: evidence/c4-recompute-eval.json)`);
    } catch (e) {
      console.error("C4_RECOMPUTE_EVAL_FAILED", e instanceof Error ? e.message : e);
      recomputeVerdict = "FAIL";
    }
  }

  const overall =
    scoutVerdict === "PASS" &&
    causalityVerdict !== "FAIL" &&
    c2Verdict !== "FAIL" &&
    c3Verdict !== "FAIL" &&
    recomputeVerdict !== "FAIL"
      ? "PASS"
      : "FAIL";
  console.log(
    `\nSUITE: scout=${scoutVerdict} causality=${causalityVerdict} c2=${c2Verdict} c3=${c3Verdict} recompute=${recomputeVerdict} -> ${overall}`,
  );
  if (overall !== "PASS") process.exit(1);
}

main().catch((e) => {
  console.error("EVAL_SUITE_FAILED", e);
  process.exit(1);
});
