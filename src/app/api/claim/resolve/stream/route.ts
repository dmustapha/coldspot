// File: src/app/api/claim/resolve/stream/route.ts
// Streamed agent entrypoint (C1): runs the IDENTICAL shared resolve loop as /resolve, but emits each
// ledger step as an NDJSON line the moment it is persisted, then a final {type:"decision"} line.
// The stream is a VIEW of the persisted run — the orchestrator's log() persists to the Trust Ledger
// FIRST and only then notifies the stream (see _resolve-deps.ts buildResolveDeps onStep). Replaying
// the streamed step lines reconstructs the SAME ledger the non-streamed route persists (C1
// stream-integrity). Reuses the MAJOR-2 transient resilience: a transient upstream fault is emitted
// as a {type:"retry"} line and the whole resolve is retried (bounded), so a cold click never 500s.
export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { resolveClaimShared } from "../../_resolve-deps";
import { validateClaimId, clientError } from "../../_validate";
import type { LedgerStep } from "@/core/types";

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

export async function POST(req: NextRequest) {
  let body: {
    claimId?: string;
    question?: string;
    imageDataUrl?: string;
    reportDataUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  const { claimId: rawClaimId, imageDataUrl, reportDataUrl } = body;
  const check = validateClaimId(rawClaimId);
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }
  const claimId = check.claimId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Each persisted ledger step is streamed as it happens (step is already durable).
      const onStep = (step: LedgerStep) => emit({ type: "step", step });

      const ATTEMPTS = 3;
      try {
        let decision;
        for (let i = 1; i <= ATTEMPTS; i++) {
          try {
            emit({ type: "status", phase: "resolving", attempt: i });
            decision = await resolveClaimShared(
              { claimId, imageDataUrl, reportDataUrl },
              onStep,
            );
            break;
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            if (!isTransient(m) || i === ATTEMPTS) throw err;
            emit({ type: "retry", attempt: i, message: m });
            await new Promise((r) => setTimeout(r, 1000 * i));
          }
        }
        emit({ type: "decision", decision, ledgerId: claimId });
      } catch (e) {
        // Mask the detail: log the real error server-side, stream a generic message to the client
        // (never a raw ORA- code / oracle.com URL / stack).
        const { message } = clientError(e, "resolve/stream");
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
