// File: src/app/api/intent/route/route.ts
// §11 Scout routing surface (O3: routing is visible). POST a prompt, get the routing decision.
// runtime=nodejs — routes through the REAL, vendored Meterless Scout engine (reads its registry
// from disk; decide() is async).

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Scout } from "@/adapters/meterless/scout";

interface IntentRequest {
  prompt?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: IntentRequest;
  try {
    body = (await req.json()) as IntentRequest;
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  const prompt = body.prompt ?? "";
  const scout = new Scout();
  const decision = await scout.decide({ prompt, user: { id: "adjuster", role: "adjuster" }, surface: "chat" });
  const { candidates } = await scout.classify({ prompt });
  return NextResponse.json({
    intent: decision.intent,
    score: candidates[0]?.score ?? 0,
    workflow: decision.executionContract.workflow,
    risk: decision.risk,
  });
}
