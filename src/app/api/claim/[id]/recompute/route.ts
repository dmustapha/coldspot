// File: src/app/api/claim/[id]/recompute/route.ts
// C4.1 "Re-derive from live sources": re-run the IDENTICAL shared resolve loop against LIVE sources
// and DIFF the fresh decision against the last persisted one. A stable estate re-derives IDENTICALLY
// (MAJOR-1 => diff.identical:true); a mutated source surfaces a visible, correct field-level Δ. This
// is AUDITABLE RESERVING: recompute is a READ re-derivation — it reuses resolveClaimShared (the same
// loop /resolve and /resolve/stream run), never a second source of truth, and never mutates the gate.
// Reuses the MAJOR-2 transient resilience so a cold click never 500s.
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { resolveClaimShared } from "../../_resolve-deps";
import { validateClaimId, clientError } from "../../_validate";
import { loadStoredRun, collectRunSources } from "../../_recompute-deps";
import { diffDecisions } from "@/core/recompute-diff";
import type { Decision, LedgerStep } from "@/core/types";

function isTransient(msg: string): boolean {
  const m = msg.toUpperCase();
  if (m.startsWith("CLAIM_NOT_FOUND") || m.includes("ABSTAIN_UNSPECIFIED")) return false;
  if (m.includes("NJS-") || m.includes("ORA-")) return false;
  return (
    /\b5\d\d\b/.test(m) ||
    m.includes("NO BODY") ||
    m.includes("FETCH FAILED") ||
    m.includes("ECONNRESET") ||
    m.includes("ECONNREFUSED") ||

    m.includes("TIMEOUT") || m.includes("TIMED OUT") || // AbortSignal.timeout + OpenAI SDK "Request timed out." -> retry then degrade honestly

    m.includes("ABORTED")
  );
}

async function recomputeWithRetry(
  claimId: string,
  imageDataUrl: string | undefined,
  reportDataUrl: string | undefined,
  onStep: (s: LedgerStep) => void,
  attempts = 3,
): Promise<Decision> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await resolveClaimShared({ claimId, imageDataUrl, reportDataUrl }, onStep);
    } catch (err) {
      lastErr = err;
      const m = err instanceof Error ? err.message : String(err);
      if (!isTransient(m) || i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastErr;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawClaimId } = await params;
  const { imageDataUrl, reportDataUrl } = (await req.json().catch(() => ({}))) as {
    imageDataUrl?: string;
    reportDataUrl?: string;
  };
  const check = validateClaimId(rawClaimId);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  const claimId = check.claimId;

  // Read the stored decision BEFORE the recompute appends its own run to the append-only ledger.
  const stored = await loadStoredRun(claimId);
  if (!stored) {
    return Response.json(
      { error: `NO_STORED_DECISION ${claimId}. Resolve this claim once before re-deriving` },
      { status: 409 },
    );
  }

  try {
    const run = collectRunSources();
    const recomputed = await recomputeWithRetry(
      claimId,
      imageDataUrl,
      reportDataUrl,
      (step) => run.sink(step.action, step.details),
    );
    const diff = diffDecisions(stored.decision, recomputed, stored.sources, run.sources());
    return Response.json({
      claimId,
      stored: stored.decision,
      recomputed,
      diff,
      storedSources: stored.sources,
      recomputedSources: run.sources(),
    });
  } catch (e) {
    // Mask upstream detail (Oracle/Zetaris/Nemotron): log server-side, return a generic message.
    const { message } = clientError(e, "recompute");
    return Response.json({ error: message }, { status: 502 });
  }
}
