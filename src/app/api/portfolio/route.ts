// File: src/app/api/portfolio/route.ts
// C3 portfolio surface. Instantiates the Meterless World Model (src/adapters/meterless/world-model —
// an event-sourced, idempotent FOLD over the Trust Ledger stream) over the LIVE ledger stream and
// returns the book-level coverage state + per-claim coverage state. This makes the World Model a
// live part of the runtime (the data source the portfolio dashboard consumes), not a side artifact.
//
// The ledger stream is read from the REAL, vendored Meterless H-MEM engine via TrustLedger.all().
// The World Model is a pure projection — it never writes the ledger; every number traces to a real
// earned ledger event.
// runtime=nodejs — the ledger reads JSONL from disk (and mirrors to Oracle).
export const runtime = "nodejs";

import { TrustLedger } from "@/adapters/meterless/trust-ledger";
import { WorldModel, type LedgerStreamEntry } from "@/adapters/meterless/world-model";

export async function GET() {
  const ledger = new TrustLedger(process.env.LEDGER_DIR ?? "./evidence/ledger");
  // TrustLedger.LedgerEntry is structurally the World Model's LedgerStreamEntry
  // ({ recordId, chatId, action, actor, details, ts }).
  const stream: LedgerStreamEntry[] = await ledger.all();

  const wm = new WorldModel();
  wm.applyAll(stream);

  return Response.json({
    book: wm.book(),
    claims: wm.allClaims(),
    eventCount: stream.length,
    source: "meterless-world-model over the real H-MEM ledger stream",
  });
}
