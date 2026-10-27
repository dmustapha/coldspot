// File: src/adapters/meterless/real-engines.ts
// Single import seam onto the REAL, vendored Meterless engines (vendor/meterless/**, Apache-2.0).
// The product runtime (TrustLedger, Scout routing) imports the engines THROUGH here so there is one
// authoritative path from the app to the vendored source — the same source the conformance suite
// (`npm run conformance`) grades. These are the engines' OWN reference/impl modules, not local
// reimplementations.
//
// Loading strategy: STATIC imports of the vendored `.ts` modules. Turbopack (Next.js) transpiles +
// bundles them into the server graph, so the Next Node runtime runs the real engines; tsx runs the
// same `.ts` directly for the evals/conformance harnesses. (A dynamic import() cannot work in BOTH:
// a fully-dynamic specifier is rejected by Turbopack, and if externalized the Next Node runtime has
// no `.ts` loader.) `allowImportingTsExtensions` in tsconfig makes the facade's `.ts`-extension
// internal imports legal for the typechecker. The public shapes are mirrored below as explicit
// types; the conformance suite verifies the engines actually match them.

import { HMEM as RealHMEMImpl } from "../../../vendor/meterless/hmem/reference/src/index.ts";
import { Scout as RealScoutImpl } from "../../../vendor/meterless/scout-intent/impl/index.ts";

// ── Real H-MEM public surface (vendor/meterless/hmem/reference/src) ──────────────────────────────
export type RealLedgerAction =
  | "create" | "read" | "update" | "delete" | "feedback" | "promote" | "demote" | "merge"
  | "conflict_detected" | "conflict_resolved"
  | "sleep_consolidate" | "sleep_archive" | "sleep_synthesize"
  | "dream_proposed" | "dream_approved" | "dream_rejected" | "restore";

export interface RealLedgerEntry {
  memoryId: string;
  action: RealLedgerAction;
  actor: string;
  timestamp: number;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface RealTrustLedgerService {
  log(
    memoryId: string,
    action: RealLedgerAction,
    actor: string,
    extra?: { previousState?: Record<string, unknown>; newState?: Record<string, unknown>; details?: Record<string, unknown> },
  ): RealLedgerEntry;
  history(memoryId: string): RealLedgerEntry[];
  all(): readonly RealLedgerEntry[];
  stats(): Record<string, number>;
}

export interface RealHMEMOptions {
  clock?: () => number;
  actor?: string;
  persistDir?: string;
}

export interface RealHMEM {
  readonly ledger: RealTrustLedgerService;
}

type RealHMEMCtor = new (opts: RealHMEMOptions) => RealHMEM;

// ── Real Scout public surface (vendor/meterless/scout-intent/impl) ───────────────────────────────
export interface RealScoutDecision {
  candidates: { intent: string; score: number }[];
  executionContract?: { intent: { primary: { id: string } } };
  risk: { level: "low" | "medium" | "high" | "block"; reason?: string };
  toolPlan: { capability: string }[];
  clarification?: { reason: string };
}

export interface RealScout {
  decide(input: { prompt: string; user?: { id: string; role: string }; surface?: string }): Promise<RealScoutDecision>;
}

type RealScoutCtor = new (opts: { intentRegistry: string; policyPack?: string[] }) => RealScout;

// Bind the vendored classes to the typed public ctors. The casts assert the engines conform to the
// public shapes mirrored above; the conformance suite is what verifies that.
const RealHMEM = RealHMEMImpl as unknown as RealHMEMCtor;
const RealScout = RealScoutImpl as unknown as RealScoutCtor;

export function loadRealHMEM(): RealHMEMCtor {
  return RealHMEM;
}

export function loadRealScout(): RealScoutCtor {
  return RealScout;
}
