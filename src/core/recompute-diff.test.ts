// File: src/core/recompute-diff.test.ts
// Unit proof for the C4.1 recompute diff: identical decisions diff to identical:true; any field or
// source-set change surfaces as an explicit, correctly-typed FieldChange. Falsifiable both ways.
import { describe, it, expect } from "vitest";
import { diffDecisions } from "./recompute-diff";
import type { Decision } from "./types";

const reserve: Decision = {
  verdict: "reserve",
  amount: 450000,
  currency: "USD",
  basis: "net case reserve $450,000.",
};
const abstain: Decision = {
  verdict: "abstain",
  missing_fact: "CAT event window",
  resolving_source: "FEMA declaration",
  partial_basis: "partial facts gathered",
};

describe("diffDecisions", () => {
  it("identical reserve decisions -> identical:true, no changes", () => {
    const d = diffDecisions(reserve, { ...reserve }, ["oracle_policy"], ["oracle_policy"]);
    expect(d.identical).toBe(true);
    expect(d.changes).toEqual([]);
  });

  it("a changed reserve amount surfaces as a single field change", () => {
    const d = diffDecisions(reserve, { ...reserve, amount: 500000 });
    expect(d.identical).toBe(false);
    expect(d.changes).toContainEqual({ field: "amount", from: 450000, to: 500000 });
  });

  it("a verdict flip surfaces the verdict change AND the vanished/appeared fields", () => {
    const d = diffDecisions(reserve, abstain);
    expect(d.identical).toBe(false);
    const fields = d.changes.map((c) => c.field);
    expect(fields).toContain("verdict");
    expect(fields).toContain("missing_fact");
  });

  it("a mutated federated source set surfaces as a sources change (order-insensitive)", () => {
    const same = diffDecisions(reserve, reserve, ["a", "b"], ["b", "a"]);
    expect(same.identical).toBe(true);
    const diff = diffDecisions(reserve, reserve, ["a", "b"], ["a"]);
    expect(diff.identical).toBe(false);
    expect(diff.changes).toContainEqual({ field: "sources", from: ["a", "b"], to: ["a"] });
  });

  it("a null stored decision (never resolved) diffs against the recomputed verdict", () => {
    const d = diffDecisions(null, reserve);
    expect(d.identical).toBe(false);
    expect(d.changes.some((c) => c.field === "verdict")).toBe(true);
  });
});
