// File: src/app/api/claim/_resolve-deps.ts
// Shared resolve wiring for BOTH the non-streamed (/resolve) and streamed (/resolve/stream) routes.
// Factoring the orchestrator deps here guarantees the two routes run the IDENTICAL agent loop over
// the IDENTICAL sources + ledger — so the stream is a VIEW of the same run, never a second source of
// truth (C1 stream-integrity: replayed stream == persisted ledger).
import { runClaim } from "@/core/orchestrator";
import type { AgentToolCall, OrchestratorDeps } from "@/core/orchestrator";
import type { ClaimContext, Decision, LedgerStep } from "@/core/types";
import { makeZetarisClient } from "@/adapters/zetaris/client";
import { federatedCoverageQuery } from "@/adapters/zetaris/lightning-sql";
import { probe } from "@/probes/source-probes";
import { reason } from "@/adapters/nemotron/client";
import { buildVisionFacts } from "@/adapters/nemotron/vision-facts";
import { agentTools } from "@/adapters/nemotron/tools";
import { decisionJsonSchema, decisionZ } from "@/core/decision-schema";
import { TrustLedger } from "@/adapters/meterless/trust-ledger";
import { listCatalog } from "@/adapters/catalog";
import { runPolicySql } from "@/adapters/oracle/db";
import { fetchCatWindow, perilToIncidentType } from "@/adapters/openfema/client";

export interface ResolveInputs {
  claimId: string;
  imageDataUrl?: string; // damage photo
  reportDataUrl?: string; // FEMA/NOAA declaration image (C1 hero CAT-window read)
}

// SELECT the claim/policy facts that seed the ClaimContext from the live ADB.
export async function loadClaimContext(claimId: string): Promise<ClaimContext> {
  const rows = await runPolicySql<{
    CLAIM_ID: string;
    POLICY_ID: string;
    PERIL: string;
    LOSS_DATE: string | Date;
    REGION: string;
    REPORTED_AMOUNT: number | null;
  }>(
    `SELECT claim_id, policy_id, peril, loss_date, region, reported_amount
       FROM claim WHERE claim_id = :id`,
    { id: claimId },
  );
  if (rows.length === 0) throw new Error(`CLAIM_NOT_FOUND ${claimId}`);
  const r = rows[0];
  const loss =
    r.LOSS_DATE instanceof Date
      ? r.LOSS_DATE.toISOString().slice(0, 10)
      : String(r.LOSS_DATE).slice(0, 10);
  return {
    claimId: r.CLAIM_ID,
    policyId: r.POLICY_ID,
    peril: r.PERIL,
    lossDate: loss,
    region: r.REGION,
    reportedAmount: r.REPORTED_AMOUNT ?? undefined,
  };
}

// Build the full orchestrator deps bundle. `onStep` is an optional side-channel invoked AFTER each
// ledger step is durably persisted — the streamed route uses it to emit the step to the client.
// The persisted ledger is unconditional; the stream only observes it (never replaces it).
export function buildResolveDeps(
  ctx: ClaimContext,
  inputs: ResolveInputs,
  onStep?: (step: LedgerStep) => void,
): OrchestratorDeps {
  const { imageDataUrl, reportDataUrl } = inputs;
  const z = makeZetarisClient();
  const ledger = new TrustLedger(process.env.LEDGER_DIR ?? "./evidence/ledger");
  return {
    listCatalog,
    // STAGE 1 PLAN — Nemotron Turn 1 (DT-3): tools ONLY, no response_format.
    planTools: async (c, catalog): Promise<AgentToolCall[]> => {
      const res = await reason({
        messages: [
          {
            role: "system",
            content:
              "You are a P&C claims coverage agent doing source DISCOVERY, not filtering. Given the claim and the candidate source catalog, call probe_source for EVERY candidate source in the catalog (including ones that look stale or irrelevant) — relevance is discovered from the live probe signals, never assumed from the name. Then call federated_query once to gather only the sources the probes confirmed relevant. Probe every candidate before you federate.",
          },
          { role: "user", content: JSON.stringify({ claim: c, catalog }) },
        ],
        tools: agentTools,
      });
      return res.toolCalls
        .map((tc) => ({
          name: tc.function?.name as AgentToolCall["name"],
          args: ((): AgentToolCall["args"] => {
            try {
              return JSON.parse(tc.function?.arguments ?? "{}");
            } catch {
              return {};
            }
          })(),
        }))
        .filter((t) => t.name === "probe_source" || t.name === "federated_query");
    },
    // C3 probe providers: the "api"/"vision" probeKinds discover relevance from the SAME live
    // signals the gather step uses — OpenFEMA's live declaration fetch and whether the claim carries
    // readable image evidence. No second source of truth: a discarded api/vision source never reaches
    // the gather seams below.
    probe: (s, c) =>
      probe(z, s, c, {
        apiRelevance: async (_src, ctx2) => {
          const w = await fetchCatWindow(ctx2.region, perilToIncidentType(ctx2.peril));
          return {
            returned: Boolean(w?.open && w?.close),
            detail: w?.detail ?? "no declared window returned",
          };
        },
        visionEvidence: () => {
          const present = Boolean(imageDataUrl || reportDataUrl);
          const kind = imageDataUrl
            ? reportDataUrl
              ? "damage photo + FEMA report"
              : "damage photo"
            : reportDataUrl
              ? "FEMA report image"
              : "none";
          return { present, kind };
        },
      }),
    federate: async () => z.runFederatedQuery(federatedCoverageQuery(ctx)),
    // STAGE 5 DECIDE — Nemotron Turn 2 (DT-3): response_format ONLY, no tools.
    reasonDecision: async (payload) => {
      const res = await reason({
        messages: [
          {
            role: "system",
            content:
              "You reserve P&C claims. Reserve only when every coverage fact is present with confidence. Otherwise ABSTAIN, naming the missing fact and the source that resolves it. Never say only 'low confidence'.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        responseSchema: decisionJsonSchema,
      });
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(res.content ?? "{}");
      } catch {
        throw new Error("ABSTAIN_UNSPECIFIED");
      }
      const parsed = decisionZ.safeParse(parsedJson);
      if (!parsed.success) throw new Error("ABSTAIN_UNSPECIFIED");
      return parsed.data;
    },
    // C1 multi-read: the damage photo -> perilMatch, the FEMA report -> CAT window (the fact that
    // resolves the hero's abstain->reserve). The image arg is only the trigger; the reads run over
    // both images the route received.
    visionFacts: async () =>
      (await buildVisionFacts({
        photoDataUrl: imageDataUrl,
        reportDataUrl,
        peril: ctx.peril,
      })) ?? {},
    // C2 OpenFEMA: the live external 4th source. Fetches the declared CAT window for the claim's
    // region + mapped incident type; the client falls back to a REAL prior OpenFEMA response and
    // reports which path was used truthfully. Never fabricates a window.
    externalCatWindow: async (c) => {
      const w = await fetchCatWindow(c.region, perilToIncidentType(c.peril));
      return { open: w.open, close: w.close, provenance: w.source, detail: w.detail };
    },
    // Persist durably FIRST (append-only ledger), THEN notify the stream observer. The stream can
    // never diverge from what was persisted because it fires off the persisted step.
    log: async (s) => {
      await ledger.log(s);
      onStep?.(s);
    },
    now: () => Date.now(),
  };
}

// Run one claim end-to-end with the shared deps. `onStep` streams each persisted ledger step.
export async function resolveClaimShared(
  inputs: ResolveInputs,
  onStep?: (step: LedgerStep) => void,
): Promise<Decision> {
  const ctx = await loadClaimContext(inputs.claimId);
  const visionTrigger = inputs.imageDataUrl ?? inputs.reportDataUrl;
  const deps = buildResolveDeps(ctx, inputs, onStep);
  // No image at all -> omit the vision beat entirely (parity with the prior behavior).
  if (!visionTrigger) deps.visionFacts = undefined;
  return runClaim(deps, ctx, visionTrigger);
}
