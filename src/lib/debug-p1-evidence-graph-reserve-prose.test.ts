// File: src/lib/debug-p1-evidence-graph-reserve-prose.test.ts
// DEBUG Phase-1 regression test. The live c3:integrity gate caught 3 orphan sentences on the
// CLM-7781 RESERVE demo claim — model-generated basis prose whose sentence classes the evidence-
// graph keyword router could not resolve to a cited fact:
//   1. bare cession arithmetic   "900,000 × 50% = 450,000."
//   2. vision-not-needed note     "Vision facts unavailable but not needed for reserve calculation;"
//   3. gate-complete assertion    "all coverage facts present with confidence."
// The router cite-keywords were widened (root cause: incomplete keyword coverage for legitimate
// model prose, not a gamed test). This pins the real stored CLM-7781 basis so the class can't
// silently regress. Captured verbatim from GET /api/ledger/CLM-7781.
import { describe, it, expect } from "vitest";
import { buildEvidenceGraph, checkGraphIntegrity, type LedgerEntry } from "./evidence-graph";

const CLM_7781_RESERVE_RUN: LedgerEntry[] = [
  { memoryId: "a", action: "probe", actor: "probe", timestamp: 1, details: { source: "oracle_policy", relevant: true } },
  { memoryId: "c", action: "federate", actor: "zetaris", timestamp: 3, details: { sources: ["FILES.policy", "FILES.endorsement", "SRC.treaty"], rowCount: 1 } },
  {
    memoryId: "e",
    action: "reconcile",
    actor: "orchestrator",
    timestamp: 5,
    details: {
      facts: {
        baseLimit: 2000000,
        reportedAmount: 900000,
        endorsementSublimit: 500000,
        treatyCessionPct: 50,
        treatyCatSublimit: 3000000,
        lossInsideCatWindow: true,
      },
      complete: true,
    },
  },
  { memoryId: "f", action: "verify", actor: "orchestrator", timestamp: 6, details: { agrees: true } },
  {
    memoryId: "g",
    action: "decide",
    actor: "nemotron",
    timestamp: 7,
    details: {
      decision: {
        verdict: "reserve",
        amount: 450000,
        currency: "USD",
        // verbatim stored prose that produced the 3 orphans
        basis:
          "The loss is a wind peril inside the cat window (2024-09-24 to 2024-09-28), subject to the 50% treaty cession. 900,000 × 50% = 450,000. Endorsement sublimit does not apply because base limit exceeds it. Vision facts unavailable but not needed for reserve calculation; all coverage facts present with confidence. " +
          // WIRE-fixed classes (2026-10-25): a fresh live model run produced two more orphan prose
          // variants the router could not resolve — a bare reserve-amount statement and a
          // gate-completeness line phrased "missing coverage facts … under provided gate". Pinned here.
          "Reserve = $375,000. Missing coverage facts with confidence: none under provided gate;",
      },
    },
  },
];

describe("DEBUG P1 — CLM-7781 reserve basis prose resolves with no orphans", () => {
  const g = buildEvidenceGraph("CLM-7781", CLM_7781_RESERVE_RUN);

  it("verdict is reserve", () => {
    expect(g.verdict).toBe("reserve");
  });

  it("every basis sentence cites >=1 fact (the 3 previously-orphaned classes now resolve)", () => {
    const r = checkGraphIntegrity(g);
    expect(r.orphanSentences, `orphans: ${JSON.stringify(r.orphanSentences)}`).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("the cession-arithmetic sentence resolves to the treaty cession fact", () => {
    const sId = g.nodes.find((n) => n.kind === "sentence" && n.label.includes("900,000 × 50%"))?.id;
    expect(sId).toBeTruthy();
    const cessionFactId = g.nodes.find((n) => n.kind === "fact" && String(n.meta?.key) === "treatyCessionPct")?.id;
    expect(cessionFactId).toBeTruthy();
    expect(g.edges.some((e) => e.from === sId && e.to === cessionFactId && e.kind === "cites")).toBe(true);
  });
});
