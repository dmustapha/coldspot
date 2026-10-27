// File: src/app/api/treaty/cat-events/route.ts
// §10 Treaty API — CAT-event registry surface (TYPE 3). Serves the catastrophe-window
// subset per policy, deterministically from the same seeded NOAA dates. runtime=nodejs.
// The hero POL-1001 row carries cat_event_close:null — the ambiguity that leaves
// lossInsideCatWindow = null downstream (INVARIANT #5), forcing a REAL abstain.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import treaties from "@/data/treaties.json";

interface TreatyRow {
  policy_id: string;
  treaty_id: string;
  cat_event_open: string;
  cat_event_close: string | null;
  cat_event_name: string;
  noaa_source: string;
}

interface CatEventRow {
  policy_id: string;
  treaty_id: string;
  cat_event_open: string;
  cat_event_close: string | null;
  cat_event_name: string;
  noaa_source: string;
}

const toCatEvent = (t: TreatyRow): CatEventRow => ({
  policy_id: t.policy_id,
  treaty_id: t.treaty_id,
  cat_event_open: t.cat_event_open,
  cat_event_close: t.cat_event_close,
  cat_event_name: t.cat_event_name,
  noaa_source: t.noaa_source,
});

const ROWS = (treaties as TreatyRow[]).map(toCatEvent);

// GET /api/treaty/cat-events?policy_id=POL-1001 -> that policy's CAT window row.
// GET /api/treaty/cat-events (no policy_id) -> all rows (Zetaris column inference).
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
