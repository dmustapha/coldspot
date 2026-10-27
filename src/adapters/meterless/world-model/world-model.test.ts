// File: src/adapters/meterless/world-model/world-model.test.ts
// C2 — World Model projection: event-sourced, IDEMPOTENT fold over the Trust Ledger stream. Proves
// per-claim coverage state + book-level cold-spot clusters are derived purely from real ledger events,
// and that re-folding the same stream is a no-op (idempotency — the World Model principle).
import { describe, it, expect } from "vitest";
import { WorldModel, type LedgerStreamEntry } from "./index";

function e(
  recordId: string,
  chatId: string,
  action: string,
  details: Record<string, unknown>,
  actor = "orchestrator",
  ts = 1,
): LedgerStreamEntry {
  return { recordId, chatId, action, actor, details, ts };
}

// A full abstain run for CLM-A (missing CAT window) + a full reserve run for CLM-B.
const STREAM: LedgerStreamEntry[] = [
  e("a:1", "CLM-A", "probe", { relevant: true }, "probe"),
  e("a:2", "CLM-A", "discard", { relevant: false }, "probe"),
  e("a:3", "CLM-A", "federate", { provenance: "live" }, "openfema"),
  e("a:4", "CLM-A", "verify", { agrees: true }),
  e("a:5", "CLM-A", "counterfactual", { thenAmount: 750_000, ifFact: "CAT event window" }),
  e("a:6", "CLM-A", "abstain", { decision: { verdict: "abstain", missing_fact: "whether the loss date falls inside the declared CAT event window" } }, "nemotron"),
  e("b:1", "CLM-B", "probe", { relevant: true }, "probe"),
  e("b:2", "CLM-B", "verify", { agrees: true }),
  e("b:3", "CLM-B", "decide", { decision: { verdict: "reserve", amount: 450_000 } }, "nemotron"),
];

describe("World Model — per-claim coverage state", () => {
  it("projects an abstain claim's gap, counterfactual, verify, and fema provenance", () => {
    const wm = new WorldModel();
    wm.applyAll(STREAM);
    const a = wm.claimState("CLM-A")!;
    expect(a.verdict).toBe("abstain");
    expect(a.missingFact).toContain("CAT event window");
    expect(a.counterfactualAmount).toBe(750_000);
    expect(a.verified).toBe(true);
    expect(a.femaProvenance).toBe("live");
    expect(a.sourcesConfirmed).toBe(1);
    expect(a.sourcesDiscarded).toBe(1);
  });

  it("projects a reserve claim's amount", () => {
    const wm = new WorldModel();
    wm.applyAll(STREAM);
    const b = wm.claimState("CLM-B")!;
    expect(b.verdict).toBe("reserve");
    expect(b.reserveAmount).toBe(450_000);
    expect(b.verified).toBe(true);
  });
});

describe("World Model — idempotency (fold the same stream twice == once)", () => {
  it("re-folding the entire stream yields identical state", () => {
    const once = new WorldModel();
    once.applyAll(STREAM);
    const twice = new WorldModel();
    twice.applyAll(STREAM);
    twice.applyAll(STREAM); // replay again — must be a no-op
    expect(twice.book()).toEqual(once.book());
    expect(twice.claimState("CLM-A")).toEqual(once.claimState("CLM-A"));
  });
});

describe("World Model — book-level cold-spot clusters", () => {
  it("aggregates systemic gaps across claims that abstain on the same fact", () => {
    const wm = new WorldModel();
    wm.applyAll(STREAM);
    // Add a second claim abstaining on the SAME gap -> a cold-spot cluster of 2.
    wm.applyAll([
      e("c:1", "CLM-C", "counterfactual", { thenAmount: 1_000_000 }),
      e("c:2", "CLM-C", "abstain", { decision: { verdict: "abstain", missing_fact: "whether the loss date falls inside the declared CAT event window" } }, "nemotron"),
    ]);
    const book = wm.book();
    expect(book.claims).toBe(3);
    expect(book.reserved).toBe(1);
    expect(book.abstained).toBe(2);
    expect(book.totalReserved).toBe(450_000);
    expect(book.gapClusters[0].claims).toBe(2); // the CAT-window cold-spot
    expect(book.gapClusters[0].counterfactualTotal).toBe(1_750_000);
    expect(book.verifiedRate).toBeGreaterThan(0);
  });
});
