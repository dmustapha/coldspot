// File: scripts/conformance.ts
// C2 — Meterless conformance gate (verifiable sponsor claim). Runs the REAL Meterless engine suites,
// vendored under vendor/meterless/ (Apache-2.0), against COLDSPOT's spec-compatible implementations:
//   - H-MEM: the engine's own conformance/runner.ts over 13 falsifiable spec vectors.
//   - Scout: the engine's own evals/runner against the v1 regression corpus + thresholds.yaml gate.
// Both are the ENGINES' OWN harnesses — we do not grade ourselves. Exit 0 only if BOTH pass, so this
// is a real gate, not a report. One command:  npm run conformance
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function run(label: string, script: string, env: Record<string, string> = {}): boolean {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync("npx", ["tsx", script, ...(label.includes("Scout") ? ["all"] : [])], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  const ok = res.status === 0;
  console.log(`${label}: exit ${res.status} -> ${ok ? "PASS" : "FAIL"}`);
  return ok;
}

const hmemOk = run(
  "Meterless H-MEM conformance",
  resolve(ROOT, "vendor/meterless/hmem/conformance/runner.ts"),
);

const scoutOk = run(
  "Meterless Scout eval",
  resolve(ROOT, "vendor/meterless/scout-intent/evals/runner/index.ts"),
  { SCOUT_IMPL: resolve(ROOT, "vendor/meterless/scout-intent/impl/index.ts") },
);

console.log(`\nCONFORMANCE SUITE: hmem=${hmemOk ? "PASS" : "FAIL"} scout=${scoutOk ? "PASS" : "FAIL"}`);
if (!(hmemOk && scoutOk)) process.exit(1);
console.log("All Meterless engine conformance suites PASS (exit 0).");
