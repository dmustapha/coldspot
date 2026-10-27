// File: src/adapters/zetaris/lightning-sql.ts
import type { ClaimContext } from "../../core/types";

// Allowed policy-id shape: letters, digits, dash, underscore (e.g. POL-1001).
const POLICY_ID_RE = /^[A-Za-z0-9_-]+$/;

// Escape a single-quoted SQL literal (double any embedded quote). Belt-and-braces
// alongside the format check (SECURITY threat matrix: no predicate injection into the
// one governed query).
export function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

export function assertPolicyId(policyId: string): string {
  if (!POLICY_ID_RE.test(policyId)) {
    throw new Error(`INVALID_POLICY_ID ${JSON.stringify(policyId)}`);
  }
  return policyId;
}

// Qualified source name for the policy-admin TYPE. The proven path for this ADB registers the
// live-extracted policy rows as FILES.policy (register-sources PATH B); set POLICY_SOURCE to
// "ORACLE.policy" if a future Zetaris build lets the JDBC datasource (PATH A) register. Only a
// qualified-name constant — the shape of the ONE governed JOIN is unchanged.
const POLICY_SOURCE = process.env.POLICY_SOURCE ?? "FILES.policy";

// The ONE governed federated query. Joins the source TYPES by qualified source name across the
// policy filestore/datasource, the endorsement filestore, and the treaty REST table.
// This SQL is executed BY Zetaris; the app performs no join (INVARIANT #1).
export function federatedCoverageQuery(ctx: ClaimContext): string {
  const policyId = sqlQuote(assertPolicyId(ctx.policyId));
  return `
    SELECT
      p.policy_id, p.base_limit, p.peril AS base_peril, p.inception, p.expiry,
      e.sublimit AS endorsement_sublimit, e.peril AS endorsement_peril, e.effective_date,
      t.cession_pct, t.cat_sublimit, t.cat_event_open, t.cat_event_close
    FROM ${POLICY_SOURCE} p
    JOIN FILES.endorsement e ON e.policy_id = p.policy_id
    JOIN SRC.treaty t        ON t.policy_id = p.policy_id
    WHERE p.policy_id = '${policyId}'
  `.trim();
}
