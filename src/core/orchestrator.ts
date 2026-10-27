// File: src/core/orchestrator.ts
// The 5-stage reasoning loop. Pure control-flow; all I/O is injected (core
// imports nothing from adapters/probes/app).
//
// [CRITIQUE E-1] Nemotron DRIVES plan->probe->gather via function-calling: the
// model selects which sources to probe and when to federate; the orchestrator
// EXECUTES the model's bounded tool plan. Reconcile + the completeness gate
// (STAGE 4) stay DETERMINISTIC (engine-as-truth) and decide/abstain (STAGE 5)
// is structured output — so model-driven SELECTION can never fabricate or skip
// a coverage fact: an under-probed load-bearing source still surfaces as a
// named missing fact at the gate -> abstain (safety net). Removing Nemotron
// collapses both source selection AND the verdict (INVARIANT #2).
import type {
  ClaimContext,
  CoverageFacts,
  Decision,
  LedgerStep,
  ProbeResult,
  RunState,
  SourceDescriptor,
  FederatedRow,
  VisionFacts,
} from "./types";
import {
  toCoverageFacts,
  isComplete,
  deterministicReserve,
  reserveBasis,
  counterfactualReserve,
  deriveVerify,
} from "./reconcile";

// C2 MARKOVIAN bound: the serialized footprint of the RunState the orchestrator threads. The facts
// snapshot is a single fixed-shape object (overwritten, never appended) and the rest are scalars, so
// this size is CONSTANT in the number of catalog sources — a long run stays flat-cost (Track 03).
export function runStateFootprint(s: RunState): number {
  return JSON.stringify(s).length;
}

// C2 per-fact confidence: map each probe's signal strength (ProbeResult.score, derived from
// schema/coverage/freshness signals) to a confidence per coverage fact the source resolves. The gate
// is NEVER an input here — this is pure provenance surfaced in the ledger (gate stays binary).
function computeFactConfidence(probed: ProbeResult[]): Record<string, number> {
  const byId = new Map(probed.map((p) => [p.sourceId, p.score]));
  const conf: Record<string, number> = {};
  const set = (fact: string, sourceId: string) => {
    const s = byId.get(sourceId);
    if (s != null) conf[fact] = Number(s.toFixed(3));
  };
  set("baseLimit", "oracle_policy");
  set("endorsementSublimit", "endorsement_rows");
  set("treatyCessionPct", "treaty_api");
  set("lossInsideCatWindow", "treaty_api");
  return conf;
}

export interface AgentToolCall {
  name: "probe_source" | "federated_query";
  args: { source_id?: string; reason?: string };
}

// Injected dependencies (adapters). core does not import adapters directly.
export interface OrchestratorDeps {
  listCatalog(claimId: string): Promise<SourceDescriptor[]>;
  // STAGE 1 PLAN (MODEL-DRIVEN): Nemotron tool-calling turn (DT-3 Turn 1, tools
  // only, NO response_format) returns the ordered probe_source/federated_query
  // calls it chooses to make.
  planTools(
    ctx: ClaimContext,
    catalog: SourceDescriptor[],
  ): Promise<AgentToolCall[]>;
  probe(source: SourceDescriptor, ctx: ClaimContext): Promise<ProbeResult>;
  federate(
    ctx: ClaimContext,
    confirmed: SourceDescriptor[],
  ): Promise<FederatedRow[]>;
  // STAGE 5 Nemotron structured output (DT-3 Turn 2, schema only, NO tools).
  reasonDecision(facts: unknown): Promise<Decision>;
  visionFacts?(imageDataUrl: string): Promise<VisionFacts>;
  // C2 OpenFEMA: an ADDITIONAL real external source fetched after the governed Zetaris federate. It
  // returns a declared CAT window (or null) + a TRUTHFUL provenance (live vs seeded-real) the
  // orchestrator logs as its own federate step. It feeds the deterministic gate exactly like vision:
  // it can only FILL an open-ended treaty window, never override a confirmed one (MAJOR-1 preserved).
  externalCatWindow?(ctx: ClaimContext): Promise<{
    open: string;
    close: string;
    provenance: "live" | "seeded-real";
    detail: string;
  } | null>;
  log(step: LedgerStep): Promise<void>;
  now(): number;
}

// 5 stages: plan -> probe -> gather -> reconcile -> decide/abstain.
export async function runClaim(
  deps: OrchestratorDeps,
  ctx: ClaimContext,
  imageDataUrl?: string,
): Promise<Decision> {
  const ts = () => deps.now();

  // C2 MARKOVIAN bounded state: one fixed-shape object threaded across stages. We OVERWRITE its
  // fields per stage (never append per-source payloads), so its footprint is constant in source count.
  const run: RunState = {
    claimId: ctx.claimId,
    stage: "plan",
    probedCount: 0,
    confirmedCount: 0,
    facts: null,
    complete: null,
  };

  // STAGE 1 PLAN (MODEL-DRIVEN): enumerate the catalog, then let Nemotron's
  // tool-calling turn choose which sources to probe and when to federate.
  const catalog = await deps.listCatalog(ctx.claimId);
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const toolCalls = await deps.planTools(ctx, catalog);

  // STAGE 2 PROBE: execute each probe_source tool call the MODEL emitted
  // (bounded: each catalog source probed at most once; unknown/duplicate ids
  // are logged and skipped, never executed).
  const probed: ProbeResult[] = [];
  const seen = new Set<string>();
  for (const call of toolCalls) {
    if (call.name !== "probe_source") continue;
    const s = call.args.source_id ? byId.get(call.args.source_id) : undefined;
    if (!s || seen.has(s.id)) {
      await deps.log({
        memoryId: ctx.claimId,
        action: "probe",
        actor: "orchestrator",
        timestamp: ts(),
        details: {
          skipped: call.args.source_id ?? null,
          reason: s ? "duplicate tool call" : "unknown source id",
        },
      });
      continue;
    }
    seen.add(s.id);
    const pr = await deps.probe(s, ctx);
    probed.push(pr);
    await deps.log({
      memoryId: ctx.claimId,
      action: pr.status === "discarded" ? "discard" : "probe",
      actor: "probe",
      timestamp: ts(),
      details: {
        source: s.id,
        relevant: pr.relevant,
        reason: pr.reason,
        signals: pr.signals,
      },
    });
  }
  // DISCOVERY-COMPLETENESS SWEEP (safety net, mirrors the federate safety-net): the model DRIVES
  // source SELECTION, but discovery must span every heterogeneous catalog TYPE so a load-bearing
  // source is never silently never-probed. Any catalog source the model did not name is probed here
  // from its OWN live signals (zetaris DESCRIBE/COUNT, OpenFEMA fetch, or image-evidence presence) —
  // real discovery, logged with the same signal-derived reason; confirmed/discarded the same way.
  for (const s of catalog) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const pr = await deps.probe(s, ctx);
    probed.push(pr);
    await deps.log({
      memoryId: ctx.claimId,
      action: pr.status === "discarded" ? "discard" : "probe",
      actor: "probe",
      timestamp: ts(),
      details: {
        source: s.id,
        relevant: pr.relevant,
        reason: pr.reason,
        signals: pr.signals,
        discoveredBy: "orchestrator.discovery_sweep",
      },
    });
  }

  const confirmed = catalog.filter(
    (s) => probed.find((p) => p.sourceId === s.id)?.relevant,
  );
  // Only "zetaris" probeKind sources participate in the ONE governed Lightning SQL join (INVARIANT
  // #1). Confirmed "api"/"vision" sources (OpenFEMA, vision) are ADDITIONAL real sources the
  // orchestrator fetches on their own seams below — they are confirmed here but federated separately.
  const confirmedForJoin = confirmed.filter((s) => s.probeKind === "zetaris");
  run.stage = "probe";
  run.probedCount = probed.length;
  run.confirmedCount = confirmed.length;

  // STAGE 3 GATHER: the model's federated_query tool call triggers ONE governed
  // Zetaris query over the confirmed sources. SAFETY NET: if the model emitted
  // no federated_query (or under-probed a load-bearing source), federation
  // still runs once over the confirmed set, so a missing source surfaces as a
  // NAMED missing fact at STAGE 4's deterministic gate — never a silent skip.
  const modelDroveFederate = toolCalls.some((t) => t.name === "federated_query");
  const rows = await deps.federate(ctx, confirmedForJoin);
  await deps.log({
    memoryId: ctx.claimId,
    action: "federate",
    actor: "zetaris",
    timestamp: ts(),
    details: {
      sources: confirmedForJoin.map((s) => s.zetarisName),
      rowCount: rows.length,
      drivenBy: modelDroveFederate
        ? "nemotron.function_calling"
        : "orchestrator.safety_net",
    },
  });

  // optional vision beat (separate Nemotron call).
  let vision: VisionFacts | undefined;
  if (imageDataUrl && deps.visionFacts) {
    vision = await deps.visionFacts(imageDataUrl);
    await deps.log({
      memoryId: ctx.claimId,
      action: "vision",
      actor: "nemotron",
      timestamp: ts(),
      details: { vision },
    });
  }

  // C2 OpenFEMA federate: fetch the declared CAT window from the LIVE external source (or the
  // seeded-real fallback) and log it as its own federate step with TRUTHFUL provenance.
  // RELEVANCE GATE (engine-as-truth, MAJOR-1): the declared window only feeds the gate when it is
  // self-consistent (close >= open) AND the claim's loss date actually falls inside it — i.e. the
  // declaration is genuinely about THIS loss. A fire claim in 2026 does NOT fall inside a 2024
  // hurricane declaration, so OpenFEMA contributes nothing and the hero still abstains. OpenFEMA
  // supplies its OWN complete window (open+close from the same declaration); it never merges a close
  // date onto a different source's open date.
  let femaVision: VisionFacts | undefined;
  if (deps.externalCatWindow) {
    const fema = await deps.externalCatWindow(ctx);
    const relevant =
      fema != null &&
      Date.parse(fema.close) >= Date.parse(fema.open) &&
      Date.parse(ctx.lossDate) >= Date.parse(fema.open) &&
      Date.parse(ctx.lossDate) <= Date.parse(fema.close);
    await deps.log({
      memoryId: ctx.claimId,
      action: "federate",
      actor: "openfema",
      timestamp: ts(),
      details: fema
        ? {
            source: "OpenFEMA DisasterDeclarationsSummaries",
            provenance: fema.provenance,
            catWindow: { open: fema.open, close: fema.close },
            lossRelevant: relevant,
            detail: relevant
              ? fema.detail
              : `${fema.detail} — NOT applied: claim loss ${ctx.lossDate} is outside this declared window (declaration not about this loss)`,
          }
        : {
            source: "OpenFEMA DisasterDeclarationsSummaries",
            catWindow: null,
            detail: "no closed declared window returned",
          },
    });
    // Only a RELEVANT declaration supplies the complete window to the gate.
    if (fema && relevant) femaVision = { catWindowOpen: fema.open, catWindowClose: fema.close };
  }

  // Merge the fact-supplying reads for the gate: a GENUINE vision read of the FEMA report wins over
  // the OpenFEMA API window (the uploaded report is claim-specific evidence); a RELEVANT OpenFEMA
  // declaration fills the gap when no report was read. Both only ever FILL an open-ended treaty
  // window (toCoverageFacts prefers a confirmed treaty window), never override a confirmed one.
  const windowVision: VisionFacts | undefined =
    vision?.catWindowClose ? vision : vision ? { ...vision, ...femaVision } : femaVision;

  // STAGE 4 RECONCILE (DETERMINISTIC — engine-as-truth; the model never
  // fabricates the verdict facts): supersession + fact-completeness gate.
  const facts = toCoverageFacts(rows, ctx, windowVision ?? null);
  // C2 per-fact confidence (provenance only — never an input to the gate).
  facts.factConfidence = computeFactConfidence(probed);
  const gate = isComplete(facts);
  run.stage = "reconcile";
  run.facts = facts;
  run.complete = gate.complete;
  await deps.log({
    memoryId: ctx.claimId,
    action: "reconcile",
    actor: "orchestrator",
    timestamp: ts(),
    details: {
      facts,
      complete: gate.complete,
      missing: gate.missing,
      factConfidence: facts.factConfidence,
    },
  });

  // C2 VERIFY (DETERMINISTIC, visible): re-derive the verdict from the facts INDEPENDENTLY and assert
  // it AGREES with the gate. Engine-as-truth — on disagreement the gate WINS (MAJOR-1 preserved) and
  // the self-correction is logged. Pure function over the same facts, so agreement is total by
  // construction; this makes the existing guardrail a VISIBLE reasoning stage, not a new authority.
  run.stage = "verify";
  const verify = deriveVerify(facts, gate.complete);
  await deps.log({
    memoryId: ctx.claimId,
    action: "verify",
    actor: "orchestrator",
    timestamp: ts(),
    details: {
      gateComplete: gate.complete,
      reDerivedComplete: verify.reDerivedComplete,
      agrees: verify.agrees,
      winner: verify.winner,
      note: verify.agrees
        ? "VERIFY re-derivation confirms the deterministic gate verdict"
        : "VERIFY disagreed; deterministic gate WINS (engine-as-truth, MAJOR-1)",
      runStateBytes: runStateFootprint(run),
    },
  });

  // STAGE 5 DECIDE/ABSTAIN: Nemotron structured output authors the decision PROSE; the
  // DETERMINISTIC gate (STAGE 4) authors the VERDICT. The model can never flip the verdict or
  // invent a fact — it only contributes human-readable narrative. This makes a given claim
  // resolve to the SAME verdict + SAME amount/missing_fact on every run, in BOTH directions
  // (INVARIANT #4/#5 — engine-as-truth).
  run.stage = "decide";
  const modelDecision = await deps.reasonDecision({ facts, gate, claim: ctx });
  let decision: Decision;

  if (gate.complete) {
    // COMPLETE: the engine sets the reserve amount deterministically from the reconciled facts.
    // The model may author the basis prose; if it returned a usable reserve basis we keep it,
    // otherwise we fall back to the engine's fact-cited basis. A model that tried to ABSTAIN on a
    // complete gate (invented a non-gate missing fact, e.g. "visionFacts") is OVERRIDDEN to the
    // deterministic reserve and the override is logged.
    const det = deterministicReserve(facts);
    const modelBasis =
      modelDecision.verdict === "reserve" && modelDecision.basis.length >= 10
        ? modelDecision.basis
        : reserveBasis(facts);
    decision = { ...det, basis: modelBasis };
    if (modelDecision.verdict !== "reserve") {
      await deps.log({
        memoryId: ctx.claimId,
        action: "gate-override",
        actor: "orchestrator",
        timestamp: ts(),
        details: {
          reason:
            "deterministic completeness gate COMPLETE; model verdict overridden to reserve (engine-as-truth, INVARIANT #4/#5)",
          modelVerdict: modelDecision.verdict,
          invented_missing_fact:
            modelDecision.verdict === "abstain" ? modelDecision.missing_fact : null,
          amount: det.amount,
        },
      });
    }
  } else {
    // INCOMPLETE: the decision MUST be a deterministic abstain naming the gate's missing fact +
    // resolving source. A nondeterministic model that tries to reserve on a missing fact is
    // OVERRIDDEN (it cannot fabricate completeness). The model contributes partial_basis only.
    const modelBasis =
      modelDecision.verdict === "abstain" && modelDecision.partial_basis
        ? modelDecision.partial_basis
        : `partial coverage facts gathered; ${gate.missing ?? "a load-bearing fact"} unresolved so a reserve cannot be set`;
    // C2 COUNTERFACTUAL (pure, deterministic): "if the missing fact were known, the engine would
    // reserve $Z". Computed over a hypothetical-complete copy of the facts — never an override of the
    // abstain verdict. Logged as its own `counterfactual` ledger step so the reasoning is auditable.
    const cf = counterfactualReserve(facts);
    decision = {
      verdict: "abstain",
      missing_fact:
        gate.missing ?? "a load-bearing coverage fact could not be confirmed",
      resolving_source:
        gate.resolving ?? "the source that supplies the missing coverage fact",
      partial_basis: modelBasis,
      ...(cf ? { counterfactual: cf } : {}),
    };
    if (cf) {
      await deps.log({
        memoryId: ctx.claimId,
        action: "counterfactual",
        actor: "orchestrator",
        timestamp: ts(),
        details: {
          ifFact: cf.ifFact,
          thenVerdict: cf.thenVerdict,
          thenAmount: cf.thenAmount,
          note: `if "${cf.ifFact}" were known, the engine would reserve $${cf.thenAmount.toLocaleString()} (deterministic, over a hypothetical-complete facts copy)`,
        },
      });
    }
    if (modelDecision.verdict !== "abstain") {
      await deps.log({
        memoryId: ctx.claimId,
        action: "gate-override",
        actor: "orchestrator",
        timestamp: ts(),
        details: {
          reason:
            "deterministic completeness gate incomplete; model verdict overridden to abstain (engine-as-truth, INVARIANT #4/#5)",
          modelVerdict: modelDecision.verdict,
          missing: gate.missing,
        },
      });
    }
  }

  await deps.log({
    memoryId: ctx.claimId,
    action: decision.verdict === "abstain" ? "abstain" : "decide",
    actor: "nemotron",
    timestamp: ts(),
    details: { decision },
  });
  return decision;
}
