// File: src/app/api/treaty/cession/route.ts
// §10 self-authored Treaty API (TYPE 3 source). Serves reinsurance cession rows
// deterministically from seeded real NOAA CAT dates. runtime=nodejs (JSON import + stable env).
// Shaped so Zetaris CREATE LIGHTNING REST TABLE SRC.treaty can infer columns from one flat row.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import treaties from "@/data/treaties.json";

interface TreatyRow {
  policy_id: string;
  treaty_id: string;
  peril: string;
  cession_pct: number;
  cat_sublimit: number;
  cat_event_open: string;
  cat_event_close: string | null;
  cat_event_name: string;
  noaa_source: string;
}

const ROWS = treaties as TreatyRow[];

// GET /api/treaty/cession?policy_id=POL-1001
//   -> the full cession row. Hero POL-1001 has cat_event_close:null (the engineered ambiguity).
// GET /api/treaty/cession (no policy_id) -> all rows (lets Zetaris infer the table schema).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const policyId = req.nextUrl.searchParams.get("policy_id");
  if (!policyId) {
    return NextResponse.json(ROWS);
  }
  const row = ROWS.find((t) => t.policy_id === policyId);
  if (!row) {
    return NextResponse.json({ error: "not_found", policy_id: policyId }, { status: 404 });
  }
  return NextResponse.json(row);
}
