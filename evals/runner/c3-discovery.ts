// File: evals/runner/c3-discovery.ts
// C3 GATE — source-discovery eval (falsifiable). Asserts, against a REAL resolved run read back from
// the persisted Trust Ledger (GET /api/ledger/[claimId]):
//   (1) BREADTH: >= 5 heterogeneous source TYPES were probed (sql · docs · api · image across the
//       catalog's six sources). Read from the catalog + the real probe/discard ledger steps.
//   (2) DECOY DISCARD: the legacy_notes decoy is DISCARDED with a SIGNAL-DERIVED reason (embeds the
//       live freshness-days + row-count values), never a constant.
//   (3) CONFIRMED-ONLY FEDERATION: every zetaris-name in the governed federate step corresponds to a
//       source the probes CONFIRMED relevant — and no discarded source reaches federation.
//   (4) FALSIFIABILITY: running the REAL probe code over a mutated decoy signal CHANGES the discard
//       reason (proves the reason is composed from signals, not hardcoded) — offline, no stack.
//
// Drives the REAL streamed resolve for the hero, then reads the ledger. Needs the app up on APP_URL.

import { probe } from "../../src/probes/source-probes";
import { listCatalog, catalogTypeCount, catalogTypeKey } from "../../src/adapters/catalog";
import type { ZetarisClient } from "../../src/adapters/zetaris/client";
import type { ClaimContext, SourceDescriptor } from "../../src/core/types";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const HERO = "CLM-4471";

interface LedgerEntry {
  action: string;
  actor: string;
  details: Record<string, unknown>;
}

export interface C3DiscoveryResult {
  verdict: "PASS" | "FAIL";
  typesProbed: number;
  catalogTypes: number;
  sourcesProbed: string[];
  decoyDiscarded: boolean;
  decoyReasonSignalDerived: boolean;
  decoyReason: string;
  federatedNames: string[];
  confirmedNames: string[];
  onlyConfirmedFederated: boolean;
  falsifiable: boolean;
  checks: Record<string, boolean>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveViaStream(claimId: string, attempts = 3): Promise<void> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/claim/resolve/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, question: "reserve?" }),
      });
      if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
        void decoder; // drain the stream to completion
      }
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      await sleep(1500 * i);
    }
  }
  throw new Error(`resolve stream failed after ${attempts} attempts: ${lastErr}`);
}

async function ledger(claimId: string): Promise<LedgerEntry[]> {
  const res = await fetch(`${APP_URL}/api/ledger/${claimId}`);
  const d = (await res.json()) as { entries?: LedgerEntry[] };
  return d.entries ?? [];
}

// Latest run of the ledger (entries after the previous terminal through the final terminal).
function latestRun(entries: LedgerEntry[]): LedgerEntry[] {
  const terminals: number[] = [];
  entries.forEach((e, i) => {
    if (e.action === "decide" || e.action === "abstain") terminals.push(i);
  });
  if (terminals.length === 0) return entries;
  const end = terminals[terminals.length - 1];
  const prevEnd = terminals.length >= 2 ? terminals[terminals.length - 2] : -1;
  return entries.slice(prevEnd + 1, end + 1);
}

// --- (4) FALSIFIABILITY: run the REAL probe code over a mutated decoy signal, offline. ---
function fakeZetaris(lastRefresh: string): ZetarisClient {
  return {
    async runFederatedQuery(sql: string): Promise<Record<string, unknown>[]> {
      if (sql.startsWith("DESCRIBE")) return [{ col_name: "policy_id" }, { col_name: "note" }];
      if (sql.includes("COUNT(*)")) return [{ n: 0 }]; // decoy: 0 matching rows
      if (sql.includes("MAX(last_refresh)")) return [{ lr: lastRefresh }];
      return [];
    },
  };
}

async function decoyReasonFalsifiable(): Promise<boolean> {
  const decoy: SourceDescriptor = {
    id: "legacy_notes",
    type: "sql",
    probeKind: "zetaris",
    zetarisName: "FILES.legacy_notes",
    label: "Legacy claim notes (decoy)",
  };
  const ctx: ClaimContext = {
    claimId: HERO,
    policyId: "POL-1001",
    peril: "fire",
    lossDate: "2026-09-14",
    region: "FL",
  };
  const stale = await probe(fakeZetaris("2019-03-01"), decoy, ctx);
  const fresh = await probe(fakeZetaris("2026-09-01"), decoy, ctx);
  // Same probe code, one signal mutated -> the reason string CHANGES.
  return stale.reason !== fresh.reason && stale.reason.includes("stale") && !fresh.reason.includes("stale");
}

export async function runC3DiscoveryEval(): Promise<C3DiscoveryResult> {
  // 1. Resolve the hero for real so the ledger reflects a genuine discovery pass.
  await resolveViaStream(HERO);
  const entries = latestRun(await ledger(HERO));
  const catalog = await listCatalog(HERO);
  const typeKeyById = new Map(catalog.map((s) => [s.id, catalogTypeKey(s)]));
  const nameById = new Map(catalog.map((s) => [s.id, s.zetarisName]));

  // (1) BREADTH — distinct heterogeneous TYPES (surface × discovery-kind) across every source the
  // ledger shows the discovery sweep probed/discarded. The sweep now probes EVERY catalog source, so
  // all six (incl. the api/vision kinds) appear as real probe/discard steps.
  const probeSteps = entries.filter((e) => e.action === "probe" || e.action === "discard");
  const probedIds = new Set(
    probeSteps.map((e) => String(e.details.source ?? e.details.sourceId ?? "")).filter(Boolean),
  );
  const typesProbed = new Set(
    [...probedIds].map((id) => typeKeyById.get(id)).filter(Boolean),
  ).size;

  // (2) DECOY DISCARD with signal-derived reason.
  const decoyStep = probeSteps.find((e) => String(e.details.source ?? e.details.sourceId) === "legacy_notes");
  const decoyDiscarded = decoyStep?.action === "discard" || decoyStep?.details.relevant === false;
  const decoyReason = String(decoyStep?.details.reason ?? "");
  const signals = (decoyStep?.details.signals ?? {}) as { freshnessDays?: number; rowCoverage?: number };
  // Signal-derived = the reason embeds the LIVE freshness-days value AND the matching-row count.
  const decoyReasonSignalDerived =
    typeof signals.freshnessDays === "number" &&
    decoyReason.includes(`${signals.freshnessDays}d`) &&
    decoyReason.includes("0 rows match");

  // (3) CONFIRMED-ONLY FEDERATION.
  const federateStep = entries.find((e) => e.action === "federate" && e.actor === "zetaris");
  const federatedNames = (federateStep?.details.sources as string[] | undefined) ?? [];
  const confirmedIds = probeSteps
    .filter((e) => e.action === "probe" && e.details.relevant === true)
    .map((e) => String(e.details.source ?? e.details.sourceId));
  const confirmedNames = confirmedIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
  const discardedNames = probeSteps
    .filter((e) => e.action === "discard" || e.details.relevant === false)
    .map((e) => nameById.get(String(e.details.source ?? e.details.sourceId)))
    .filter(Boolean) as string[];
  const onlyConfirmedFederated =
    federatedNames.length > 0 &&
    federatedNames.every((n) => confirmedNames.includes(n)) &&
    !federatedNames.some((n) => discardedNames.includes(n));

  // (4) FALSIFIABILITY.
  const falsifiable = await decoyReasonFalsifiable();

  const checks = {
    breadth_ge_5_types: typesProbed >= 5,
    decoy_discarded: Boolean(decoyDiscarded),
    decoy_reason_signal_derived: decoyReasonSignalDerived,
    only_confirmed_federated: onlyConfirmedFederated,
    falsifiable,
  };
  const verdict = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";

  return {
    verdict,
    typesProbed,
    catalogTypes: catalogTypeCount(),
    sourcesProbed: [...probedIds].filter(Boolean),
    decoyDiscarded: Boolean(decoyDiscarded),
    decoyReasonSignalDerived,
    decoyReason,
    federatedNames,
    confirmedNames,
    onlyConfirmedFederated,
    falsifiable,
    checks,
  };
}
