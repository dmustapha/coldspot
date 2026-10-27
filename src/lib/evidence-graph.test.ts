// File: src/lib/evidence-graph.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEvidenceGraph, checkGraphIntegrity, type LedgerEntry } from "./evidence-graph";

// A real RESERVE run (shape captured from GET /api/ledger/CLM-4471 after a vision-resolved reserve).
const RESERVE_RUN: LedgerEntry[] = [
  { memoryId: "a", action: "probe", actor: "probe", timestamp: 1, details: { source: "oracle_policy", relevant: true } },
  { memoryId: "b", action: "discard", actor: "probe", timestamp: 2, details: { source: "legacy_notes", relevant: false, reason: "stale" } },
  { memoryId: "c", action: "federate", actor: "zetaris", timestamp: 3, details: { sources: ["FILES.policy", "FILES.endorsement", "SRC.treaty"], rowCount: 1 } },
  { memoryId: "d", action: "vision", actor: "nemotron", timestamp: 4, details: { vision: { catWindowOpen: "2026-09-10", catWindowClose: "2026-09-18" } } },
  {
    memoryId: "e",
    action: "reconcile",
    actor: "orchestrator",
    timestamp: 5,
    details: {
      facts: {
        baseLimit: 5000000,
        endorsementSublimit: 1000000,
        treatyCessionPct: 40,
        treatyCatSublimit: 2000000,
        lossInsideCatWindow: true,
        catWindow: { open: "2026-09-10", close: "2026-09-18" },
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
        amount: 750000,
        currency: "USD",
        basis:
          "Loss confirmed inside the declared CAT event window. Binding CAT sublimit $2,000,000 (capped by base policy limit $5,000,000). Gross exposure $1,250,000, less 40% treaty cession ($500,000 ceded) = net case reserve $750,000.",
      },
    },
  },
];

// A real ABSTAIN run (window unresolved -> abstain naming the missing fact).
const ABSTAIN_RUN: LedgerEntry[] = [
  { memoryId: "a", action: "probe", actor: "probe", timestamp: 1, details: { source: "oracle_policy", relevant: true } },
  { memoryId: "c", action: "federate", actor: "zetaris", timestamp: 3, details: { sources: ["FILES.policy"], rowCount: 1 } },
  {
    memoryId: "e",
    action: "reconcile",
    actor: "orchestrator",
    timestamp: 5,
    details: {
      facts: {
        baseLimit: 5000000,
        endorsementSublimit: 1000000,
        treatyCessionPct: 40,
        lossInsideCatWindow: null,
        catWindow: null,
      },
      complete: false,
      missing: "whether the loss date falls inside the declared CAT event window",
    },
  },
  {
    memoryId: "g",
    action: "abstain",
    actor: "nemotron",
    timestamp: 7,
    details: {
      decision: {
        verdict: "abstain",
        missing_fact: "whether the loss date falls inside the declared CAT event window",
        resolving_source: "treaty CAT-event registry",
        partial_basis:
          "gross reserve bounded between $1,000,000 (endorsement fire sublimit) and $5,000,000 (base limit); ceded portion 40% subject to treaty cession.",
      },
    },
  },
];

describe("buildEvidenceGraph + integrity (RESERVE)", () => {
  const g = buildEvidenceGraph("CLM-4471", RESERVE_RUN);

  it("has sentence, fact, and step nodes", () => {
    expect(g.verdict).toBe("reserve");
    expect(g.nodes.some((n) => n.kind === "sentence")).toBe(true);
    expect(g.nodes.some((n) => n.kind === "fact")).toBe(true);
    expect(g.nodes.some((n) => n.kind === "step")).toBe(true);
  });

  it("every basis sentence cites >=1 fact and every fact has a producing step (no orphans/dangling)", () => {
    const r = checkGraphIntegrity(g);
    expect(r.orphanSentences, `orphans: ${JSON.stringify(r.orphanSentences)}`).toEqual([]);
    expect(r.danglingFacts, `dangling: ${JSON.stringify(r.danglingFacts)}`).toEqual([]);
    expect(r.danglingSentenceNodes).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("the CAT-window fact is produced by the vision step (provenance chain)", () => {
    const factId = g.nodes.find((n) => n.kind === "fact" && String(n.meta?.key) === "lossInsideCatWindow")?.id;
    expect(factId).toBeTruthy();
    const edge = g.edges.find((e) => e.from === factId && e.kind === "producedBy");
    expect(edge).toBeTruthy();
    const step = g.nodes.find((n) => n.id === edge!.to);
    expect(step?.meta?.action).toBe("vision");
  });
});

describe("buildEvidenceGraph + integrity (ABSTAIN)", () => {
  const g = buildEvidenceGraph("CLM-4471", ABSTAIN_RUN);

  it("abstain verdict; missing_fact + partial_basis sentences resolve to facts", () => {
    expect(g.verdict).toBe("abstain");
    const r = checkGraphIntegrity(g);
    expect(r.orphanSentences).toEqual([]);
    expect(r.danglingFacts).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("integrity holds for the orchestrator's deterministic partial_basis fallback", () => {
  it("'partial coverage facts gathered; … unresolved so a reserve cannot be set' resolves", () => {
    const run: LedgerEntry[] = JSON.parse(JSON.stringify(ABSTAIN_RUN));
    const dec = run[run.length - 1].details.decision as { partial_basis: string };
    dec.partial_basis =
      "partial coverage facts gathered; base policy limit unresolved so a reserve cannot be set";
    const g = buildEvidenceGraph("CLM-9002", run);
    const r = checkGraphIntegrity(g);
    expect(r.orphanSentences).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("falsifiability: a fabricated basis sentence citing no real fact is caught", () => {
  it("flags an orphan sentence", () => {
    const tampered: LedgerEntry[] = JSON.parse(JSON.stringify(RESERVE_RUN));
    const dec = tampered[tampered.length - 1].details.decision as { basis: string };
    dec.basis = "The moon phase was favorable for reserving."; // cites no coverage fact
    const g = buildEvidenceGraph("CLM-4471", tampered);
    const r = checkGraphIntegrity(g);
    expect(r.ok).toBe(false);
    expect(r.orphanSentences.length).toBeGreaterThan(0);
  });
});

// The C3 gate (scripts/c3-integrity.ts) grades PINNED canonical narrated runs, not the drifting live
// ledger (DESIGN-HANDOFF §3 rule 2). These tests lock those exact fixtures: they must PASS the
// unchanged integrity check, AND the check must still catch a fabricated sentence inside a pinned
// fixture — so pinning the run-selector removed the DRIFT, never the FALSIFIABILITY.
describe("C3 pinned canonical fixtures (the runs scripts/c3-integrity.ts grades)", () => {
  const FIXTURES = [
    { claimId: "CLM-4471", verdict: "abstain", file: "scripts/fixtures/c3-canonical/CLM-4471.abstain.json" },
    { claimId: "CLM-7781", verdict: "reserve", file: "scripts/fixtures/c3-canonical/CLM-7781.reserve.json" },
  ] as const;
  const load = (f: string): LedgerEntry[] =>
    JSON.parse(readFileSync(resolve(process.cwd(), f), "utf8")) as LedgerEntry[];

  for (const { claimId, verdict, file } of FIXTURES) {
    it(`${claimId} canonical ${verdict} run passes integrity (no orphan/dangling)`, () => {
      const g = buildEvidenceGraph(claimId, load(file));
      expect(g.verdict).toBe(verdict);
      const r = checkGraphIntegrity(g);
      expect(r.orphanSentences, `orphans: ${JSON.stringify(r.orphanSentences)}`).toEqual([]);
      expect(r.danglingFacts, `dangling: ${JSON.stringify(r.danglingFacts)}`).toEqual([]);
      expect(r.ok).toBe(true);
    });

    it(`${claimId} fixture is STILL falsifiable — a fabricated basis sentence is caught`, () => {
      const entries = load(file);
      const dec = entries[entries.length - 1].details.decision as Record<string, unknown>;
      const key = typeof dec.basis === "string" ? "basis" : "partial_basis";
      dec[key] = "The moon phase was favorable for reserving."; // cites no coverage fact
      const g = buildEvidenceGraph(claimId, entries);
      const r = checkGraphIntegrity(g);
      expect(r.ok).toBe(false);
      expect(r.orphanSentences.length).toBeGreaterThan(0);
    });
  }
});
