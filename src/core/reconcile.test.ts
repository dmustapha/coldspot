// File: src/core/reconcile.test.ts
import { describe, it, expect } from "vitest";
import {
  toCoverageFacts,
  isComplete,
  computeReserve,
  reserveBasis,
  deterministicReserve,
} from "./reconcile";
import type { CoverageFacts } from "./types";

describe("toCoverageFacts + isComplete", () => {
  it("null CAT window -> abstain missing-fact (CAT window)", () => {
    // Open-ended cat_event_close in the federated row -> lossInsideCatWindow stays null (INVARIANT #5).
    const facts = toCoverageFacts(
      [
        {
          base_limit: 5_000_000,
          endorsement_sublimit: 1_000_000,
          endorsement_peril: "fire",
          cession_pct: 40,
          cat_sublimit: 2_000_000,
          cat_event_open: "2026-09-10",
          cat_event_close: null, // engineered ambiguity
        },
      ],
      { peril: "fire", lossDate: "2026-09-14" },
    );
    expect(facts.lossInsideCatWindow).toBeNull();

    expect(isComplete(facts)).toEqual({
      complete: false,
      missing:
        "whether the loss date falls inside the declared CAT event window",
      resolving:
        "treaty CAT-event registry (SRC.treaty cat_event_close) / NOAA event close date",
    });
  });

  it("complete facts -> reserve-eligible (complete:true)", () => {
    const facts: CoverageFacts = {
      baseLimit: 5_000_000,
      endorsementSublimit: 1_000_000,
      treatyCessionPct: 40,
      lossInsideCatWindow: true,
    };
    expect(isComplete(facts)).toEqual({ complete: true });
  });

  it("falsifiability: same code, a close date + loss inside -> complete:true", () => {
    const facts = toCoverageFacts(
      [
        {
          base_limit: 5_000_000,
          endorsement_sublimit: 1_000_000,
          endorsement_peril: "fire",
          cession_pct: 40,
          cat_sublimit: 2_000_000,
          cat_event_open: "2026-09-10",
          cat_event_close: "2026-09-20", // close date present -> no ambiguity
        },
      ],
      { peril: "fire", lossDate: "2026-09-14" },
    );
    expect(facts.lossInsideCatWindow).toBe(true);
    expect(isComplete(facts)).toEqual({ complete: true });
  });
});

describe("C1 vision-gate wiring (synthesize CAT window from a vision read)", () => {
  // The HERO row: open-ended CAT window (cat_event_close null). Without vision the gate abstains.
  const heroRows = [
    {
      base_limit: 5_000_000,
      endorsement_sublimit: 1_000_000,
      endorsement_peril: "fire",
      cession_pct: 40,
      cat_sublimit: 2_000_000,
      cat_event_open: "2026-09-10",
      cat_event_close: null, // open-ended -> the missing fact
    },
  ];
  const heroClaim = { peril: "fire", lossDate: "2026-09-14", reportedAmount: 1_250_000 };

  it("NO vision -> CAT window unresolved -> abstain (MAJOR-1 preserved)", () => {
    const facts = toCoverageFacts(heroRows, heroClaim);
    expect(facts.lossInsideCatWindow).toBeNull();
    expect(isComplete(facts).complete).toBe(false);
    expect(isComplete(facts).missing).toContain("CAT event window");
  });

  it("WITH a vision-read close date -> window synthesized -> gate complete -> reserve amount", () => {
    const facts = toCoverageFacts(heroRows, heroClaim, {
      catWindowOpen: "2026-09-10",
      catWindowClose: "2026-09-18", // genuine vision read of the FEMA report
      catEventName: "FL Panhandle Wind-Fire Event (2026)",
      confidence: 1,
    });
    expect(facts.catWindow).toEqual({ open: "2026-09-10", close: "2026-09-18" });
    expect(facts.lossInsideCatWindow).toBe(true); // 2026-09-14 is inside
    expect(isComplete(facts).complete).toBe(true);
    // The reserve is a pure function of the reconciled facts: min(5M,2M) binding, gross capped at
    // reported 1.25M, less 40% cession -> 750k net. The vision read RESOLVED the abstain->reserve.
    expect(deterministicReserve(facts).amount).toBe(750_000);
  });

  it("falsifiable: a vision close date BEFORE the loss -> loss outside window -> NOT reserve-eligible", () => {
    // If the vision read were a no-op stamp, this would still 'complete'. It must reflect the dates.
    // The federated row's open date (2026-09-10) is authoritative; vision supplies only the close.
    const facts = toCoverageFacts(heroRows, heroClaim, {
      catWindowClose: "2026-09-05", // loss 2026-09-14 is AFTER this -> outside the window
      confidence: 1,
    });
    expect(facts.catWindow).toEqual({ open: "2026-09-10", close: "2026-09-05" });
    expect(facts.lossInsideCatWindow).toBe(false);
  });

  it("federated close date WINS over vision (vision only fills an open-ended gap)", () => {
    const rowsWithClose = [{ ...heroRows[0], cat_event_close: "2026-09-20" }];
    const facts = toCoverageFacts(rowsWithClose, heroClaim, {
      catWindowOpen: "1999-01-01",
      catWindowClose: "1999-01-02", // adversarial vision read must be IGNORED
      confidence: 1,
    });
    expect(facts.catWindow).toEqual({ open: "2026-09-10", close: "2026-09-20" });
    expect(facts.lossInsideCatWindow).toBe(true);
  });

  it("vision carried on the facts for provenance even when it did not change the gate", () => {
    const vision = { damageType: "fire", perilMatch: true, confidence: 0.9 };
    const facts = toCoverageFacts(heroRows, heroClaim, vision);
    expect(facts.visionFacts).toEqual(vision);
    // no catWindowClose supplied -> window stays open-ended -> still abstains.
    expect(facts.lossInsideCatWindow).toBeNull();
  });
});

describe("computeReserve (deterministic reserve math — engine-as-truth)", () => {
  // The CLM-7781 demo RESERVE claim: POL-1002 Hurricane Helene, base 3M = cat_sublimit 3M,
  // reported 900k, cession 50%. Pure function -> same amount on every call (INVARIANT #4/#5).
  const complete: CoverageFacts = {
    baseLimit: 3_000_000,
    endorsementSublimit: 750_000,
    treatyCessionPct: 50,
    treatyCatSublimit: 3_000_000,
    reportedAmount: 900_000,
    lossInsideCatWindow: true,
  };

  it("caps gross at the reported loss, nets the treaty cession", () => {
    const r = computeReserve(complete);
    expect(r.bindingLimit).toBe(3_000_000); // min(base 3M, cat sublimit 3M)
    expect(r.gross).toBe(900_000); // reported < binding limit
    expect(r.ceded).toBe(450_000); // 50% of 900k
    expect(r.amount).toBe(450_000); // net retention
  });

  it("is deterministic — identical output across repeated calls", () => {
    const a = computeReserve(complete);
    const b = computeReserve(complete);
    const c = computeReserve(complete);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(reserveBasis(complete)).toBe(reserveBasis(complete));
    expect(deterministicReserve(complete)).toEqual(deterministicReserve(complete));
  });

  it("deterministicReserve returns a reserve verdict citing the net amount", () => {
    const d = deterministicReserve(complete);
    expect(d.verdict).toBe("reserve");
    expect(d.amount).toBe(450_000);
    expect(d.currency).toBe("USD");
    expect(d.basis).toContain("$450,000");
    expect(d.basis).toContain("50% treaty cession");
  });

  it("CAT sublimit below base limit becomes the binding limit; no reported amount -> binding limit grosses", () => {
    const r = computeReserve({
      baseLimit: 5_000_000,
      treatyCatSublimit: 2_000_000,
      treatyCessionPct: 40,
      lossInsideCatWindow: true,
    });
    expect(r.bindingLimit).toBe(2_000_000); // cat sublimit binds
    expect(r.gross).toBe(2_000_000); // no reported amount -> full binding limit
    expect(r.ceded).toBe(800_000); // 40%
    expect(r.amount).toBe(1_200_000);
  });
});
