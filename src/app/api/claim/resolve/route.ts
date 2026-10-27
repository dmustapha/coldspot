// File: src/app/api/claim/resolve/route.ts
// Agent entrypoint (non-streamed): wires the deterministic core orchestrator to the live adapters
// via the SHARED resolve deps (see ../_resolve-deps.ts — identical loop to the streamed route).
// DT-3 two-turn: planTools (Turn 1, tools only) then reasonDecision (Turn 2, schema only).
export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { resolveClaimShared } from "../_resolve-deps";
import { validateClaimId, clientError } from "../_validate";

// A transient fault anywhere in the resolve chain — Oracle cold-connect, the Zetaris BFF, or the
// Nemotron NIM — must NOT 500 a judge's click. These upstreams intermittently return a bodyless 5xx
// or a connect/timeout fault on a cold first hit; all are safe to retry (the resolve is read-only +
// deterministic). A genuine logic error (CLAIM_NOT_FOUND, schema abstain) is NOT transient.
// Oracle cold-connect faults (NJS-/ORA-) are deliberately EXCLUDED here: they are already retried
// inside db.ts (getConnectionResilient). Retrying them again at the route re-runs the whole resolve
// and multiplies the inner retry into a multi-minute storm. Keeping Oracle out of this set — and
// relying on the keepalive to hold the ADB warm — is what bounds the request.
function isTransient(msg: string): boolean {
  const m = msg.toUpperCase();
  if (m.startsWith("CLAIM_NOT_FOUND") || m.includes("ABSTAIN_UNSPECIFIED")) return false;
  if (m.includes("NJS-") || m.includes("ORA-")) return false; // Oracle: owned by the inner retry
  return (
    /\b5\d\d\b/.test(m) || // upstream 5xx from Zetaris/Nemotron (e.g. "500 status code (no body)")
    m.includes("NO BODY") ||
    m.includes("FETCH FAILED") ||
    m.includes("ECONNRESET") ||
    m.includes("ECONNREFUSED") ||

    m.includes("TIMEOUT") || m.includes("TIMED OUT") || // AbortSignal.timeout + OpenAI SDK "Request timed out." -> retry then degrade honestly

    m.includes("ABORTED")
  );
}

export async function POST(req: NextRequest) {
  // Parse the body FIRST, outside the resolve try/catch: a malformed or empty request body is a
  // CLIENT error (400), never a server fault (500). req.json() throws SyntaxError on non-JSON.
  let body: {
    claimId?: string;
    question?: string;
    imageDataUrl?: string; // damage photo
    reportDataUrl?: string; // FEMA/NOAA declaration image (C1 hero CAT-window read)
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
  try {
    // Bounded transient-retry over the whole resolve: a cold upstream (Oracle/Zetaris/Nemotron)
    // 5xx or connect fault is retried with backoff so the judge's first click never 500s (MAJOR-2).
    const resolveOnce = () =>
      resolveClaimShared({ claimId, imageDataUrl, reportDataUrl });
    const ATTEMPTS = 3;
    let decision;
    for (let i = 1; i <= ATTEMPTS; i++) {
      try {
        decision = await resolveOnce();
        break;
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        if (!isTransient(m) || i === ATTEMPTS) throw err;
        console.warn(`[resolve] transient fault (attempt ${i}/${ATTEMPTS}): ${m} — retrying`);
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
    return Response.json({ decision, ledgerId: claimId });
  } catch (e) {
    const { status, message } = clientError(e, "resolve");
    return Response.json({ error: message }, { status });
  }
}
