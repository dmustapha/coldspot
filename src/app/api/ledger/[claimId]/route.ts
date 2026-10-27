// File: src/app/api/ledger/[claimId]/route.ts
// Replay surface (§11): re-walk the append-only Trust Ledger for a claim, in order.
// runtime=nodejs — TrustLedger reads JSONL from disk and mirrors to Oracle (sockets + wallet).
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { TrustLedger } from "@/adapters/meterless/trust-ledger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const { claimId } = await params;
  const ledger = new TrustLedger(process.env.LEDGER_DIR ?? "./evidence/ledger");
  // LedgerEntry = { recordId, chatId, action, actor, details, ts } (reconstructed from the REAL
  // H-MEM engine). Normalize to the UI contract { memoryId, action, actor, timestamp, details }.
  // `domainAction`/`claimId` are the adapter's bookkeeping keys carried inside the real engine's
  // `details` (because its LedgerAction union excludes our domain actions) — they are already
  // surfaced as `action`/`claimId`, so strip them to return the original raw domain details.
  const history = await ledger.history(claimId);
  const entries = history.map((e) => {
    const { domainAction: _da, claimId: _ci, ...details } = e.details;
    void _da;
    void _ci;
    return {
      memoryId: e.recordId,
      action: e.action,
      actor: e.actor,
      timestamp: e.ts,
      details,
    };
  });
  return Response.json({ claimId, entries });
}
