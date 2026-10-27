// File: src/adapters/meterless/scout.ts
// §11 Scout routing. This adapter routes the product's NL claim-intake THROUGH the REAL, vendored
// Meterless Scout engine (vendor/meterless/scout-intent/impl — the same impl `npm run conformance`
// grades). The engine is example+description driven: it scores a prompt by token overlap with each
// registered intent's examples, applies an injection policy pack, and emits an execution contract
// with the chosen intent id, candidate scores, risk level, and tool plan.
//
// COLDSPOT's surface (route/decide/classify) is preserved; it just delegates classification to the
// real engine and maps the engine's intent id -> COLDSPOT workflow (intent id == workflow here).
// route()/decide()/classify() are async because the real engine's decide() is async.

import type { Workflow } from "../../core/types";
import { loadRealScout, type RealScout, type RealScoutDecision } from "./real-engines";
import { resolve } from "node:path";

export type Surface = "chat" | "queue";

export interface IntentCandidate {
  intent: string;
  score: number;
}

export interface RiskAssessment {
  level: "low" | "med" | "high";
  reason?: string;
}

export interface ScoutDecision {
  intent: string;
  risk: RiskAssessment;
  toolPlan: string[];
  executionContract: { workflow: string };
}

export interface RouteResult {
  workflow: string;
  intent: string;
  score: number;
  claimContext?: { claimId: string };
}

const DEFAULT_WORKFLOW: Workflow = "abstain-triage";

// Pulls a CLM-#### claim id out of free text, if present.
const CLAIM_ID_RE = /\bCLM-\d+\b/i;

// The claims-domain registry in the real engine's shape (data/scout-registry.json). Resolved from
// the repo root; process.cwd() is the coldspot dir under next dev / tsx.
const REGISTRY_PATH = resolve(process.cwd(), "data/scout-registry.json");

// Map the real engine's risk level onto COLDSPOT's 3-band risk. "block" (injection) -> high.
function mapRisk(level: RealScoutDecision["risk"]["level"], reason?: string): RiskAssessment {
  if (level === "block") return { level: "high", reason: reason ?? "policy block" };
  if (level === "high") return { level: "high", reason };
  if (level === "medium") return { level: "med", reason };
  return { level: "low", reason };
}

export class Scout {
  private real?: RealScout;

  constructor(_opts?: { intentRegistry?: string }) {
    // The real engine is loaded lazily (dynamic import of the vendored module) on first use.
  }

  private async engine(): Promise<RealScout> {
    if (!this.real) {
      const RealScoutCtor = loadRealScout();
      this.real = new RealScoutCtor({ intentRegistry: REGISTRY_PATH, policyPack: ["adversarial-tight"] });
    }
    return this.real;
  }

  // classify: run the REAL engine and surface its candidate scores (highest first).
  async classify({ prompt }: { prompt: string; surface?: Surface }): Promise<{ candidates: IntentCandidate[] }> {
    const real = await this.engine();
    const d = await real.decide({ prompt });
    return { candidates: d.candidates };
  }

  async decide({
    prompt,
    user,
    surface,
  }: {
    prompt: string;
    user?: { id: string; role: string };
    surface?: Surface;
  }): Promise<ScoutDecision> {
    const real = await this.engine();
    const d = await real.decide({ prompt, user, surface });
    const chosen = d.executionContract?.intent.primary.id ?? "GENERAL";
    // GENERAL (below the reject band) routes to the abstain-triage safety workflow.
    const workflow = chosen === "GENERAL" ? DEFAULT_WORKFLOW : chosen;
    return {
      intent: chosen,
      risk: mapRisk(d.risk.level, d.risk.reason),
      toolPlan: d.toolPlan.map((t) => t.capability),
      executionContract: { workflow },
    };
  }

  // route: the NL claim-intake entry point. Delegates to the real engine, maps the chosen intent id
  // to a COLDSPOT workflow, and parses any CLM-#### claim context from the text.
  async route(nlText: string): Promise<RouteResult> {
    const real = await this.engine();
    const d = await real.decide({ prompt: nlText });
    const chosen = d.executionContract?.intent.primary.id ?? "GENERAL";
    const workflow = chosen === "GENERAL" ? DEFAULT_WORKFLOW : chosen;
    const top = d.candidates.find((c) => c.intent === chosen) ?? d.candidates[0];
    const result: RouteResult = {
      workflow,
      intent: chosen,
      score: top?.score ?? 0,
    };
    const match = nlText.match(CLAIM_ID_RE);
    if (match) result.claimContext = { claimId: match[0].toUpperCase() };
    return result;
  }
}
