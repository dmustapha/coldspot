// File: src/probes/source-probes.test.ts
import { describe, it, expect } from "vitest";
import { probe } from "./source-probes";
import type { ZetarisClient } from "../adapters/zetaris/client";
import type { ClaimContext, SourceDescriptor } from "../core/types";

const CTX: ClaimContext = {
  claimId: "CLM-4471",
  policyId: "POL-1001",
  peril: "fire",
  lossDate: "2026-09-14",
  region: "FL",
};

// Per-source canned signal rows. A fake client answers DESCRIBE / COUNT / MAX by
// matching the SQL against the qualified source name — NO live stack (unit test).
interface Fixture {
  hasPolicyColumn: boolean;
  matchingRows: number;
  lastRefresh: string | null; // ISO date or null (no refresh column)
}

function fakeClient(fixtures: Record<string, Fixture>): ZetarisClient {
  const forSql = (sql: string): string | undefined =>
    Object.keys(fixtures).find((name) => sql.includes(name));
  return {
    async runFederatedQuery(sql: string): Promise<Record<string, unknown>[]> {
      const name = forSql(sql);
      if (!name) return [];
      const f = fixtures[name];
      if (sql.startsWith("DESCRIBE")) {
        return f.hasPolicyColumn
          ? [{ col_name: "policy_id" }, { col_name: "base_limit" }]
          : [{ col_name: "note" }];
      }
      if (sql.includes("COUNT(*)")) return [{ n: f.matchingRows }];
      if (sql.includes("MAX(last_refresh)")) {
        if (f.lastRefresh == null) throw new Error("no refresh column");
        return [{ lr: f.lastRefresh }];
      }
      return [];
    },
  };
}

const decoySource: SourceDescriptor = {
  id: "legacy_notes",
  type: "sql",
  probeKind: "zetaris",
  zetarisName: "ORACLE.legacy_notes",
  label: "Legacy claim notes (decoy)",
};

describe("probe()", () => {
  it("decoy legacy_notes discarded with signal-derived reason", async () => {
    const z = fakeClient({
      "ORACLE.legacy_notes": {
        hasPolicyColumn: true,
        matchingRows: 0,
        lastRefresh: "2019-03-01",
      },
    });
    const r = await probe(z, decoySource, CTX);
    expect(r.status).toBe("discarded");
    expect(r.relevant).toBe(false);
    // Reason embeds LIVE signal values (freshness days + row count), not a constant.
    expect(r.reason).toContain("stale (last refreshed 2019-03-01");
    expect(r.reason).toContain(`${r.signals.freshnessDays}d`);
    expect(r.reason).toContain("0 rows match policy POL-1001");
  });

  it("flipping decoy freshness changes the reason (falsifiability)", async () => {
    const stale = await probe(
      fakeClient({
        "ORACLE.legacy_notes": {
          hasPolicyColumn: true,
          matchingRows: 0,
          lastRefresh: "2019-03-01",
        },
      }),
      decoySource,
      CTX,
    );
    const fresh = await probe(
      fakeClient({
        "ORACLE.legacy_notes": {
          hasPolicyColumn: true,
          matchingRows: 0,
          lastRefresh: "2026-09-01",
        },
      }),
      decoySource,
      CTX,
    );
    // Same probe code, one signal mutated -> the reason string CHANGES.
    expect(stale.reason).not.toBe(fresh.reason);
    expect(stale.reason).toContain("stale");
    expect(fresh.reason).not.toContain("stale");
    expect(fresh.reason).toBe("0 rows match policy POL-1001");
  });

  it("oracle_policy / endorsement_rows / treaty_api all relevant", async () => {
    const sources: SourceDescriptor[] = [
      { id: "oracle_policy", type: "sql", probeKind: "zetaris", zetarisName: "ORACLE.policy", label: "Policy admin (Oracle)" },
      { id: "endorsement_rows", type: "docs", probeKind: "zetaris", zetarisName: "FILES.endorsement", label: "Manuscript endorsements" },
      { id: "treaty_api", type: "api", probeKind: "zetaris", zetarisName: "SRC.treaty", label: "Reinsurance treaty" },
    ];
    const z = fakeClient({
      "ORACLE.policy": { hasPolicyColumn: true, matchingRows: 1, lastRefresh: "2026-09-10" },
      // REST/filestore sources expose no refresh column -> MAX(last_refresh) throws -> freshness null (does not auto-fail).
      "FILES.endorsement": { hasPolicyColumn: true, matchingRows: 1, lastRefresh: null },
      "SRC.treaty": { hasPolicyColumn: true, matchingRows: 1, lastRefresh: null },
    });
    for (const s of sources) {
      const r = await probe(z, s, CTX);
      expect(r.relevant, `${s.id} should be relevant`).toBe(true);
      expect(r.status).toBe("relevant");
    }
  });
});

// C3 — cross-TYPE discovery: the "api" (OpenFEMA live) + "vision" (image evidence) probe kinds.
const apiSource: SourceDescriptor = {
  id: "openfema",
  type: "api",
  probeKind: "api",
  zetarisName: "openfema.declarations",
  label: "FEMA disaster declarations (live API)",
};
const visionSource: SourceDescriptor = {
  id: "damage_photo",
  type: "image",
  probeKind: "vision",
  zetarisName: "vision.evidence",
  label: "Damage photo / FEMA report (vision)",
};
const noZ = {} as ZetarisClient; // api/vision probes never touch Zetaris

describe("probe() — api kind (OpenFEMA live signal)", () => {
  it("confirmed when the live API returns a usable record; reason embeds the live detail", async () => {
    const r = await probe(noZ, apiSource, CTX, {
      apiRelevance: async () => ({
        returned: true,
        detail: 'DR-4844-FL "HURRICANE MILTON" 2024-10-05..2024-11-02',
      }),
    });
    expect(r.status).toBe("relevant");
    expect(r.relevant).toBe(true);
    expect(r.reason).toContain("HURRICANE MILTON");
  });

  it("discarded when the live API returns no applicable record; reason is signal-derived", async () => {
    const r = await probe(noZ, apiSource, CTX, {
      apiRelevance: async () => ({ returned: false, detail: "no declared window for FL/fire" }),
    });
    expect(r.status).toBe("discarded");
    expect(r.relevant).toBe(false);
    expect(r.reason).toContain("no declared window for FL/fire");
  });

  it("falsifiability: flipping the live API reply flips the verdict + reason", async () => {
    const hit = await probe(noZ, apiSource, CTX, {
      apiRelevance: async () => ({ returned: true, detail: "window A" }),
    });
    const miss = await probe(noZ, apiSource, CTX, {
      apiRelevance: async () => ({ returned: false, detail: "window B absent" }),
    });
    expect(hit.relevant).not.toBe(miss.relevant);
    expect(hit.reason).not.toBe(miss.reason);
  });
});

describe("probe() — vision kind (image-evidence signal)", () => {
  it("confirmed when the claim carries readable evidence; reason names the document kind", () => {
    const r = probe(noZ, visionSource, CTX, {
      visionEvidence: () => ({ present: true, kind: "FEMA report image" }),
    });
    // probeVision is sync but probe() returns a Promise — resolve it.
    return (r as Promise<Awaited<typeof r>>).then((res) => {
      expect(res.status).toBe("relevant");
      expect(res.reason).toContain("FEMA report image");
    });
  });

  it("discarded when the claim carries no image evidence", async () => {
    const r = await probe(noZ, visionSource, CTX, {
      visionEvidence: () => ({ present: false, kind: "none" }),
    });
    expect(r.status).toBe("discarded");
    expect(r.relevant).toBe(false);
    expect(r.reason).toContain("kind=none");
  });
});
