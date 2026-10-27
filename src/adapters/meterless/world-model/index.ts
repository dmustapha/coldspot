// File: src/adapters/meterless/world-model/index.ts
// C2 — Meterless World Model (coverage-state projection). An event-sourced, idempotent FOLD over the
// Trust Ledger JSONL stream (the same append-only log H-MEM writes). It maintains per-claim and
// book-level COVERAGE STATE — which coverage facts resolved, which gaps persist, how each claim
// decided — the "ongoing work" data source the C3 portfolio dashboard consumes.
//
// Honors the Meterless World Model principles (docs/architecture.md): a persistent, queryable,
// evolving representation built by replaying an append-only event stream; append-friendly and
// IDEMPOTENT (folding the same event twice yields the same state — keyed by ledger entry identity).
// It is domain-specialized to claims coverage, not the generic entity graph.
//
// Pure projection: reads the ledger, never writes it. No new source of truth (every number traces to
// a real ledger event). runtime=nodejs implied by callers that read the JSONL from disk.

import type { LedgerAction } from "../../../core/types";

// One Trust-Ledger entry as persisted (TrustLedger.log writes recordId/chatId/action/actor/details/ts).
export interface LedgerStreamEntry {
  recordId: string;
  chatId: string; // the claimId
  action: LedgerAction | string;
  actor: string;
  details: Record<string, unknown>;
  ts: number;
}

// Per-claim coverage state projected from the stream.
export interface ClaimCoverageState {
  claimId: string;
  verdict: "reserve" | "abstain" | "pending";
  reserveAmount: number | null; // set when the claim reserved
  missingFact: string | null; // set when the claim abstained (the coverage gap)
  counterfactualAmount: number | null; // "if the gap were closed, reserve $Z" (from the counterfactual step)
  verified: boolean; // a VERIFY step confirmed the gate
  sourcesProbed: number;
  sourcesConfirmed: number;
  sourcesDiscarded: number;
  femaProvenance: "live" | "seeded-real" | null; // which OpenFEMA path fed this claim
  lastTs: number;
  eventCount: number;
}

// Book-level (portfolio) coverage state aggregated across all claims.
export interface BookCoverageState {
  claims: number;
  reserved: number;
  abstained: number;
  pending: number;
  totalReserved: number; // sum of reserve amounts
  totalCounterfactual: number; // sum of counterfactual amounts on abstains (addressable upside)
  verifiedRate: number; // fraction of decided claims that passed VERIFY
  // Systemic coverage-gap clusters: missing-fact -> how many claims abstain on it (the cold-spots).
  gapClusters: { missingFact: string; claims: number; counterfactualTotal: number }[];
}

export class WorldModel {
  // Idempotency: a ledger entry is folded at most once, keyed by recordId (stable per append).
  private seen = new Set<string>();
  private claims = new Map<string, ClaimCoverageState>();

  private blank(claimId: string): ClaimCoverageState {
    return {
      claimId,
      verdict: "pending",
      reserveAmount: null,
      missingFact: null,
      counterfactualAmount: null,
      verified: false,
      sourcesProbed: 0,
      sourcesConfirmed: 0,
      sourcesDiscarded: 0,
      femaProvenance: null,
      lastTs: 0,
      eventCount: 0,
    };
  }

  // Fold ONE ledger entry into the projection. Idempotent: re-folding the same entry is a no-op.
  apply(e: LedgerStreamEntry): void {
    if (this.seen.has(e.recordId)) return;
    this.seen.add(e.recordId);
    const s = this.claims.get(e.chatId) ?? this.blank(e.chatId);
    s.eventCount += 1;
    s.lastTs = Math.max(s.lastTs, e.ts);
    const d = e.details;

    switch (e.action) {
      case "probe":
        // A probe step with a boolean `relevant` is a real source probe (skips carry no `relevant`).
        if (typeof d.relevant === "boolean") {
          s.sourcesProbed += 1;
          if (d.relevant) s.sourcesConfirmed += 1;
        }
        break;
      case "discard":
        s.sourcesProbed += 1;
        s.sourcesDiscarded += 1;
        break;
      case "federate":
        if (e.actor === "openfema" && (d.provenance === "live" || d.provenance === "seeded-real")) {
          s.femaProvenance = d.provenance;
        }
        break;
      case "verify":
        if (d.agrees === true) s.verified = true;
        break;
      case "counterfactual":
        if (typeof d.thenAmount === "number") s.counterfactualAmount = d.thenAmount;
        break;
      case "decide": {
        const dec = d.decision as { verdict?: string; amount?: number } | undefined;
        if (dec?.verdict === "reserve") {
          s.verdict = "reserve";
          s.reserveAmount = typeof dec.amount === "number" ? dec.amount : s.reserveAmount;
        }
        break;
      }
      case "abstain": {
        const dec = d.decision as { verdict?: string; missing_fact?: string } | undefined;
        if (dec?.verdict === "abstain") {
          s.verdict = "abstain";
          s.missingFact = dec.missing_fact ?? s.missingFact;
        }
        break;
      }
      default:
        break;
    }
    this.claims.set(e.chatId, s);
  }

  // Replay a whole stream (idempotent; safe to call repeatedly / on new tails).
  applyAll(entries: LedgerStreamEntry[]): void {
    for (const e of entries) this.apply(e);
  }

  claimState(claimId: string): ClaimCoverageState | undefined {
    return this.claims.get(claimId);
  }

  allClaims(): ClaimCoverageState[] {
    return [...this.claims.values()].sort((a, b) => a.claimId.localeCompare(b.claimId));
  }

  // Book-level projection: aggregates + the systemic coverage-gap clusters (cold-spots across the book).
  book(): BookCoverageState {
    const all = this.allClaims();
    const reserved = all.filter((c) => c.verdict === "reserve");
    const abstained = all.filter((c) => c.verdict === "abstain");
    const pending = all.filter((c) => c.verdict === "pending");
    const decided = reserved.length + abstained.length;
    const verifiedDecided = all.filter((c) => c.verdict !== "pending" && c.verified).length;

    const gapMap = new Map<string, { claims: number; counterfactualTotal: number }>();
    for (const c of abstained) {
      if (!c.missingFact) continue;
      const g = gapMap.get(c.missingFact) ?? { claims: 0, counterfactualTotal: 0 };
      g.claims += 1;
      g.counterfactualTotal += c.counterfactualAmount ?? 0;
      gapMap.set(c.missingFact, g);
    }
    const gapClusters = [...gapMap.entries()]
      .map(([missingFact, g]) => ({ missingFact, claims: g.claims, counterfactualTotal: g.counterfactualTotal }))
      .sort((a, b) => b.claims - a.claims || b.counterfactualTotal - a.counterfactualTotal);

    return {
      claims: all.length,
      reserved: reserved.length,
      abstained: abstained.length,
      pending: pending.length,
      totalReserved: reserved.reduce((s, c) => s + (c.reserveAmount ?? 0), 0),
      totalCounterfactual: abstained.reduce((s, c) => s + (c.counterfactualAmount ?? 0), 0),
      verifiedRate: decided ? Number((verifiedDecided / decided).toFixed(3)) : 0,
      gapClusters,
    };
  }
}
