// File: src/probes/source-probes.ts
import type { ZetarisClient } from "../adapters/zetaris/client";
import { assertPolicyId, sqlQuote } from "../adapters/zetaris/lightning-sql";
import type {
  ClaimContext,
  ProbeResult,
  ProbeSignals,
  SourceDescriptor,
} from "../core/types";

const FRESHNESS_THRESHOLD_DAYS = 365;
const COVERAGE_THRESHOLD = 1; // >=1 row matching the claim's policy

// C3 cross-type discovery signals. The orchestrator injects live providers so the api/vision probes
// discover relevance from the SAME live signals the gather step uses (no second source of truth):
//   - apiRelevance: did the live external REST source return a usable record for THIS claim?
//   - visionEvidence: does the claim carry the document this vision source reads?
export interface ProbeProviders {
  apiRelevance?: (
    source: SourceDescriptor,
    ctx: ClaimContext,
  ) => Promise<{ returned: boolean; detail: string }>;
  visionEvidence?: (
    source: SourceDescriptor,
    ctx: ClaimContext,
  ) => { present: boolean; kind: string };
}

function blankSignals(): ProbeSignals {
  return {
    schemaMatch: false,
    lastRefreshIso: null,
    freshnessDays: null,
    rowCoverage: 0,
  };
}

// Read a cell from a federated row by any of several candidate column names.
function cell(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return undefined;
}

// Probe one source LIVE. Dispatches by probeKind; every discard reason is COMPOSED from the live
// signal values at runtime (INVARIANT #3) — there is no constant reason string, for ANY kind.
export async function probe(
  z: ZetarisClient,
  source: SourceDescriptor,
  ctx: ClaimContext,
  providers: ProbeProviders = {},
): Promise<ProbeResult> {
  switch (source.probeKind) {
    case "api":
      return probeApi(source, ctx, providers);
    case "vision":
      return probeVision(source, ctx, providers);
    case "zetaris":
    default:
      return probeZetaris(z, source, ctx);
  }
}

// --- "zetaris" kind: DESCRIBE/COUNT/MAX against the federated Lightning name (unchanged logic). ---
async function probeZetaris(
  z: ZetarisClient,
  source: SourceDescriptor,
  ctx: ClaimContext,
): Promise<ProbeResult> {
  const signals = blankSignals();
  try {
    // schema probe: does the source expose a policy_id column?
    const cols = await z.runFederatedQuery(`DESCRIBE ${source.zetarisName}`);
    signals.schemaMatch = cols.some((c) =>
      String(cell(c, "col_name", "name") ?? "")
        .toLowerCase()
        .includes("policy"),
    );

    // coverage probe: rows matching this claim's policy. policyId runs through the SAME
    // allowlist+escape as the governed query (consistent trust boundary); zetarisName is a
    // catalog-trusted constant and is the only un-escaped interpolant.
    if (signals.schemaMatch) {
      const safePolicyId = sqlQuote(assertPolicyId(ctx.policyId));
      const rows = await z.runFederatedQuery(
        `SELECT COUNT(*) AS n FROM ${source.zetarisName} WHERE policy_id = '${safePolicyId}'`,
      );
      signals.rowCoverage = Number(cell(rows[0] ?? {}, "n") ?? 0);
    }

    // freshness probe: newest refresh timestamp IF the source exposes one.
    // Sources without a refresh column (REST/filestore) leave freshnessDays null
    // and DO NOT auto-pass or auto-fail freshness (BUILD-GATE #3).
    const fr = await z
      .runFederatedQuery(`SELECT MAX(last_refresh) AS lr FROM ${source.zetarisName}`)
      .catch(() => [] as Record<string, unknown>[]);
    const lr = cell(fr[0] ?? {}, "lr");
    if (typeof lr === "string" && lr.length > 0) {
      signals.lastRefreshIso = lr;
      signals.freshnessDays = Math.floor(
        (Date.now() - Date.parse(lr)) / 86_400_000,
      );
    }
  } catch {
    return {
      sourceId: source.id,
      relevant: false,
      score: 0,
      reason: `source unreachable during probe`,
      signals,
      status: "unavailable",
    };
  }

  // Build reason FROM signals — composed at runtime, no constant reason strings.
  const reasons: string[] = [];
  if (!signals.schemaMatch) reasons.push("no policy_id column");
  if (
    signals.freshnessDays != null &&
    signals.freshnessDays > FRESHNESS_THRESHOLD_DAYS
  )
    reasons.push(
      `stale (last refreshed ${signals.lastRefreshIso}, ${signals.freshnessDays}d > ${FRESHNESS_THRESHOLD_DAYS}d)`,
    );
  if (signals.rowCoverage < COVERAGE_THRESHOLD)
    reasons.push(`0 rows match policy ${ctx.policyId}`);

  const relevant =
    signals.schemaMatch &&
    signals.rowCoverage >= COVERAGE_THRESHOLD &&
    (signals.freshnessDays == null ||
      signals.freshnessDays <= FRESHNESS_THRESHOLD_DAYS);

  const score =
    (signals.schemaMatch ? 0.4 : 0) +
    (signals.rowCoverage >= COVERAGE_THRESHOLD ? 0.4 : 0) +
    (signals.freshnessDays != null && signals.freshnessDays <= FRESHNESS_THRESHOLD_DAYS
      ? 0.2
      : 0);

  return {
    sourceId: source.id,
    relevant,
    score,
    reason: relevant
      ? `relevant: schema match, ${signals.rowCoverage} matching rows, fresh`
      : reasons.join("; "),
    signals,
    status: relevant ? "relevant" : "discarded",
  };
}

// --- "api" kind: a live external REST fetch. Relevance = did the source return a usable record for
// this claim's region/peril? The reason embeds the LIVE detail string (never a constant). ---
async function probeApi(
  source: SourceDescriptor,
  ctx: ClaimContext,
  providers: ProbeProviders,
): Promise<ProbeResult> {
  const signals = blankSignals();
  if (!providers.apiRelevance) {
    signals.apiRecordReturned = null;
    signals.apiDetail = "no live API provider wired";
    return {
      sourceId: source.id,
      relevant: false,
      score: 0,
      reason: `API source not probed (${signals.apiDetail})`,
      signals,
      status: "indeterminate",
    };
  }
  let returned = false;
  let detail = "";
  try {
    const r = await providers.apiRelevance(source, ctx);
    returned = r.returned;
    detail = r.detail;
  } catch (e) {
    signals.apiRecordReturned = false;
    signals.apiDetail = e instanceof Error ? e.message : String(e);
    return {
      sourceId: source.id,
      relevant: false,
      score: 0,
      reason: `live API unreachable: ${signals.apiDetail}`,
      signals,
      status: "unavailable",
    };
  }
  signals.apiRecordReturned = returned;
  signals.apiDetail = detail;
  return {
    sourceId: source.id,
    relevant: returned,
    score: returned ? 0.8 : 0.2,
    // Reason is the LIVE detail from the external source — mutate the API's reply and it changes.
    reason: returned
      ? `relevant: live API returned a usable record (${detail})`
      : `discarded: no applicable record from the live API (${detail})`,
    signals,
    status: returned ? "relevant" : "discarded",
  };
}

// --- "vision" kind: a vision-extractable document. Relevance = does the claim carry the evidence
// this source reads? Reason embeds WHICH document was found/absent (never a constant). ---
function probeVision(
  source: SourceDescriptor,
  ctx: ClaimContext,
  providers: ProbeProviders,
): ProbeResult {
  const signals = blankSignals();
  const r = providers.visionEvidence?.(source, ctx) ?? {
    present: false,
    kind: "none",
  };
  signals.evidencePresent = r.present;
  signals.evidenceKind = r.kind;
  return {
    sourceId: source.id,
    relevant: r.present,
    score: r.present ? 0.8 : 0.2,
    reason: r.present
      ? `relevant: claim carries ${r.kind} for a vision read`
      : `discarded: claim carries no readable image evidence (kind=${r.kind})`,
    signals,
    status: r.present ? "relevant" : "discarded",
  };
}
