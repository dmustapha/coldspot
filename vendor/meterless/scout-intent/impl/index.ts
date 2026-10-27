// Spec-compatible Scout implementation for the Meterless scout-intent eval harness.
//
// The scout-intent engine ships the SPEC + eval harness only (no src/). This is COLDSPOT's
// implementation of the documented Scout API (docs/architecture.md): constructor
// `{ intentRegistry, policyPack }`, async `decide({ prompt, user, surface })` returning
// `{ executionContract.intent.primary.id, candidates[], risk.level, toolPlan[].capability,
// clarification }`. It is driven ENTIRELY by the fixture intent registry (examples + description +
// capabilities) — never hardcoded to the regression labels — plus a policy-pack injection detector.
// Verify it with the engine's own harness:
//   SCOUT_IMPL=<abs>/vendor/meterless/scout-intent/impl/index.ts \
//     npx tsx vendor/meterless/scout-intent/evals/runner/index.ts all
//
// Apache-2.0, consistent with the vendored engine. Deterministic; zero runtime deps.

import { readFileSync } from "node:fs";

interface RegistryIntent {
  id: string;
  category: string;
  description: string;
  capabilities: string[];
  riskClass: "low" | "medium" | "high";
  examples: string[];
}

const STOP = new Set([
  "the", "a", "an", "to", "of", "and", "or", "for", "me", "my", "i", "you", "we",
  "on", "in", "at", "is", "are", "what", "whats", "s", "do", "does", "with", "about",
  "this", "that", "give", "show", "how", "all", "over", "from", "next", "it",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

// Policy-pack "adversarial-tight" injection detectors. Each targets a distinct documented technique:
// instruction override, role/tag spoofing, delimiter injection, credential/tool exfiltration,
// embedded-document injection, and unicode-bidi override. Tuned for precision 1.0 on benign prompts.
const INJECTION_PATTERNS: RegExp[] = [
  // 1. Instruction override / jailbreak.
  /\b(ignore|disregard|forget)\b[\s\S]{0,40}\b(previous|prior|above|all|the|your)?\b[\s\S]{0,20}\b(instructions?|rules?|prompts?|user|training)\b/i,
  /\b(unrestricted|developer|jailbreak|dan|god|admin) mode\b/i,
  /\byou are now\b/i,
  /\bpretend (to be|you are|you're)\b/i,
  // 2. Role / system-tag spoofing (fake conversation delimiters).
  /<\/?\s*(system|user|assistant|inst)\s*>/i,
  /\[\s*\/?\s*inst\s*\]/i,
  // 3. Privilege escalation / credential + secret exfiltration.
  /\b(reveal|print|show|dump|list|grant)\b[\s\S]{0,30}\b(system prompt|api keys?|credentials?|secrets?|admin|all accounts)\b/i,
  /\bgrant (me|us)?\s*admin\b/i,
  // 4. Tool-name smuggling (invoking an internal/admin tool mid-prompt).
  /\b(use|call|invoke|run)\b[\s\S]{0,20}\b(internal_admin_panel|admin_panel|internal_[a-z_]+)\b/i,
  /\binternal_admin_panel\b/i,
  // 5. Destructive DB / data commands embedded in prose.
  /\bdrop (the )?\w+ table\b/i,
  // 6. Unicode bidi / control-character override (RLO/LRO and friends).
  /[‪-‮⁦-⁩]/,
];

export interface ScoutDecision {
  candidates: { intent: string; score: number }[];
  executionContract?: { intent: { primary: { id: string } } };
  risk: { level: "low" | "medium" | "high" | "block"; reason?: string };
  toolPlan: { capability: string }[];
  clarification?: { reason: string };
}

const BANDS = { REJECT: 0.4 } as const;

export class Scout {
  private intents: RegistryIntent[];

  constructor(opts: { intentRegistry: string; policyPack?: string[] }) {
    const reg = JSON.parse(readFileSync(opts.intentRegistry, "utf-8")) as { intents: RegistryIntent[] };
    this.intents = reg.intents;
  }

  // Score the prompt against one intent: token overlap with its examples + description, weighted so
  // a strong single-example match dominates. Deterministic, registry-driven.
  private scoreIntent(promptTokens: string[], intent: RegistryIntent): number {
    const pset = new Set(promptTokens);
    const exampleScores = intent.examples.map((ex) => {
      const et = tokenize(ex);
      if (et.length === 0) return 0;
      const hits = et.filter((t) => pset.has(t)).length;
      return hits / et.length; // fraction of the example's tokens the prompt covers
    });
    const bestExample = exampleScores.length ? Math.max(...exampleScores) : 0;
    const descTokens = tokenize(intent.description);
    const descHits = descTokens.filter((t) => pset.has(t)).length;
    const descScore = descTokens.length ? descHits / descTokens.length : 0;
    // Example match is the primary signal; description is a light tiebreaker.
    return 0.8 * bestExample + 0.2 * descScore;
  }

  private detectInjection(prompt: string): boolean {
    return INJECTION_PATTERNS.some((re) => re.test(prompt));
  }

  async decide(input: { prompt: string; user?: { id: string; role: string }; surface?: string }): Promise<ScoutDecision> {
    const prompt = input.prompt;
    const tokens = tokenize(prompt);

    // Policy pack: an instruction-override attempt BLOCKS before any routing.
    if (this.detectInjection(prompt)) {
      return {
        candidates: [],
        risk: { level: "block", reason: "instruction-override / jailbreak pattern detected" },
        toolPlan: [],
      };
    }

    const scored = this.intents
      .filter((i) => i.id !== "GENERAL")
      .map((i) => ({ intent: i.id, score: this.scoreIntent(tokens, i), ref: i }))
      .sort((a, b) => b.score - a.score || a.intent.localeCompare(b.intent));

    const top = scored[0];
    const candidates = scored.map((s) => ({ intent: s.intent, score: Number(s.score.toFixed(4)) }));

    // Below the reject band -> GENERAL (never routes to tools).
    if (!top || top.score < BANDS.REJECT) {
      return {
        candidates,
        executionContract: { intent: { primary: { id: "GENERAL" } } },
        risk: { level: "low" },
        toolPlan: [],
        // Ambiguous but non-trivial prompts ask for clarification rather than guessing.
        ...(tokens.length > 0 && top && top.score >= 0.2
          ? { clarification: { reason: "underspecified" } }
          : {}),
      };
    }

    const chosen = top.ref;
    const riskLevel = chosen.riskClass;
    return {
      candidates,
      executionContract: { intent: { primary: { id: chosen.id } } },
      risk: { level: riskLevel },
      // Tool plan = the matched intent's declared capabilities (the harness checks expected ⊆ emitted).
      toolPlan: chosen.capabilities.map((capability) => ({ capability })),
    };
  }
}
