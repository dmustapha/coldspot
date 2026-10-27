// File: src/app/api/claims/route.ts
// Seeded claim queue. No list endpoint existed upstream — this SELECTs the seeded
// claims from the live Oracle ADB via runPolicySql. runtime=nodejs (node-oracledb
// opens TCP sockets + reads the wallet from disk; impossible on Edge, §N+13).
// Oracle cold connects are slow (~30-60s); the pool's queueTimeout governs it.
export const runtime = "nodejs";

import { runPolicySql } from "@/adapters/oracle/db";

interface ClaimRow {
  CLAIM_ID: string;
  POLICY_ID: string;
  PERIL: string;
  REGION: string;
}

export async function GET() {
  try {
    const rows = await runPolicySql<ClaimRow>(
      `SELECT claim_id, policy_id, peril, region FROM claim ORDER BY claim_id`,
    );
    const claims = rows.map((r) => ({
      claimId: r.CLAIM_ID,
      policyId: r.POLICY_ID,
      peril: r.PERIL,
      region: r.REGION,
    }));
    return Response.json({ claims });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ claims: [], error: message }, { status: 200 });
  }
}
