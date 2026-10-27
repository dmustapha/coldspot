// File: src/app/api/claim/_validate.ts
// Shared input guard for the claim routes. A claimId is operator-controlled identifier text, not a
// query — it must be a short, charset-bounded token BEFORE it reaches any DB call. This rejects a
// missing / non-string / oversized / bad-charset id with a 400, which closes the ORA-01460
// oversized-body leak (an over-long id reached Oracle and bounced back a raw ORA- string).
//
// It also carries the client-facing error taxonomy: on a caught server error we log the real detail
// server-side and return a GENERIC message, so a raw ORA- code / oracle.com URL / stack never
// reaches the client.

const CLAIM_ID_RE = /^[A-Za-z0-9_-]+$/;
const CLAIM_ID_MAX = 64;

export type ClaimIdCheck = { ok: true; claimId: string } | { ok: false; error: string };

// Validate a claimId from a request body or route param. Returns a 400-worthy error string on fail.
export function validateClaimId(raw: unknown): ClaimIdCheck {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "claimId required" };
  }
  if (raw.length > CLAIM_ID_MAX) {
    return { ok: false, error: `claimId too long (max ${CLAIM_ID_MAX} characters)` };
  }
  if (!CLAIM_ID_RE.test(raw)) {
    return { ok: false, error: "claimId must match [A-Za-z0-9_-]" };
  }
  return { ok: true, claimId: raw };
}

// Generic client message for a caught server error. CLAIM_NOT_FOUND is a real, safe-to-surface logic
// outcome (the judge mistyped an id); everything else is masked to a generic string and the real
// detail is logged server-side only — never echo err.message, ORA- codes, or oracle.com URLs.
export function clientError(e: unknown, context: string): { status: number; message: string } {
  const detail = e instanceof Error ? e.message : String(e);
  if (detail.startsWith("CLAIM_NOT_FOUND")) {
    return { status: 404, message: "claim not found" };
  }
  console.error(`[${context}] ${detail}`);
  return { status: 500, message: "resolution failed, please retry" };
}
