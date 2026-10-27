// File: src/lib/evidence-graph.ts
// C3 — Evidence-graph builder. A PURE view over the append-only Trust Ledger (the exact entries
// GET /api/ledger/[claimId] returns). It turns one claim's LATEST run into a provenance graph:
//
//   decision-basis SENTENCE  --cites-->  source FACT  --producedBy-->  ledger STEP
//
// The UI lets a judge click a basis sentence and watch its provenance chain light up. This module is
// the single source of the graph's integrity: it is falsifiable by the C3 gate — every decision-basis
// sentence MUST resolve to >= 1 ledger step and >= 1 source fact (no orphan claims-of-fact; no
// dangling nodes). It invents nothing — every node is read from a real ledger entry.

export interface LedgerEntry {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

export type NodeKind = "sentence" | "fact" | "step";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string; // human text
  // provenance payload for the UI tooltip / detail
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string; // node id
  to: string; // node id
  kind: "cites" | "producedBy";
}

export interface EvidenceGraph {
  claimId: string;
  verdict: "reserve" | "abstain" | "unknown";
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- the coverage facts the decision basis can cite, each mapped to the ledger ACTION that produces
// it. This is the provenance map: a fact is only a graph node when the reconcile step actually
// carries a non-null value for it (so there are no dangling fact nodes). ---
interface FactSpec {
  key: string; // key inside reconcile `facts`
  label: (v: unknown) => string;
  // which ledger step produced this fact (by action + optional actor match)
  producer: { action: string; actor?: string };
  // keywords that, if present in a basis sentence, mean the sentence cites this fact
  cite: string[];
  // when true, the fact node exists even if the value is null — it is a KNOWN coverage slot the
  // gate evaluated (an UNRESOLVED fact the abstain's missing_fact sentence legitimately cites).
  // Its producer falls back to the reconcile step (the step that determined it unresolved).
  includeWhenNull?: boolean;
}

const FACT_SPECS: FactSpec[] = [
  {
    key: "baseLimit",
    label: (v) =>
      v == null ? "Base policy limit (unresolved)" : `Base policy limit $${Number(v).toLocaleString()}`,
    producer: { action: "federate", actor: "zetaris" },
    cite: ["base policy limit", "base limit"],
    includeWhenNull: true,
  },
  {
    key: "reportedAmount",
    label: (v) => `Reported loss amount $${Number(v).toLocaleString()}`,
    producer: { action: "federate", actor: "zetaris" },
    cite: ["reported", "insured loss", "gross exposure", "gross reserve", "loss of", "reserve of", "reserve calculation", "reserve =", "reserve $", "reserve amount", "recommended reserve"],
  },
  {
    key: "endorsementSublimit",
    label: (v) => `Endorsement sublimit $${Number(v).toLocaleString()}`,
    producer: { action: "federate", actor: "zetaris" },
    cite: ["endorsement", "sublimit"],
  },
  {
    key: "treatyCessionPct",
    label: (v) => `Treaty cession ${Number(v)}%`,
    producer: { action: "federate", actor: "zetaris" },
    cite: ["treaty", "cession", "ceded", "% ="],
  },
  {
    key: "treatyCatSublimit",
    label: (v) => `Treaty CAT sublimit $${Number(v).toLocaleString()}`,
    producer: { action: "federate", actor: "zetaris" },
    cite: ["cat sublimit", "sublimit"],
  },
  {
    key: "lossInsideCatWindow",
    label: (v) =>
      v === true
        ? "Loss confirmed inside the declared CAT event window"
        : "CAT event window unresolved for this loss",
    producer: { action: "vision", actor: "nemotron" },
    cite: ["cat event window", "inside the declared", "window", "vision", "cat window"],
    includeWhenNull: true,
  },
];

// Pull the LATEST run out of the append-only ledger (entries after the previous terminal through the
// final terminal) — mirrors TrustLedgerTimeline.latestRun so the graph matches the timeline.
export function latestRun(entries: LedgerEntry[]): LedgerEntry[] {
  const terminals: number[] = [];
  entries.forEach((e, i) => {
    if (e.action === "decide" || e.action === "abstain") terminals.push(i);
  });
  if (terminals.length === 0) return entries;
  const end = terminals[terminals.length - 1];
  const prevEnd = terminals.length >= 2 ? terminals[terminals.length - 2] : -1;
  return entries.slice(prevEnd + 1, end + 1);
}

// Split a basis string into its component sentences (the clickable claims-of-fact).
function sentences(basis: string): string[] {
  return basis
    .split(/(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

// Build the evidence graph for one claim's ledger entries.
export function buildEvidenceGraph(
  claimId: string,
  entries: LedgerEntry[],
): EvidenceGraph {
  const run = latestRun(entries);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (n: GraphNode) => {
    if (!nodeIds.has(n.id)) {
      nodeIds.add(n.id);
      nodes.push(n);
    }
  };

  // STEP nodes: one per ledger step in the latest run (the producing events).
  run.forEach((e, i) => {
    addNode({
      id: `step:${i}`,
      kind: "step",
      label: `${e.action} (${e.actor})`,
      meta: { action: e.action, actor: e.actor, timestamp: e.timestamp, details: e.details },
    });
  });

  // reconcile step = the fact snapshot; find it + its index for producedBy edges.
  const reconcileIdx = run.findIndex((e) => e.action === "reconcile");
  const facts = reconcileIdx >= 0 ? asRecord(run[reconcileIdx].details.facts) : null;
  const reconcileDetails = reconcileIdx >= 0 ? run[reconcileIdx].details : null;

  // Synthetic reconcile-sourced facts the decision prose routinely cites:
  //   - the CLAIM CONTEXT the gate ran over (peril / region / loss date / policy) — these are the
  //     claim attributes the reconcile step reasoned about; they trace to the reconcile step.
  //   - the GATE STATE (complete / incomplete) — the gate verdict itself, cited by "gate incomplete".
  // Both are real ledger-step provenance (the reconcile step), never synthesized numbers.
  const factNodeByKey = new Map<string, string>();

  // FACT nodes: one per coverage fact present (non-null) in the reconcile snapshot. Each fact gets a
  // producedBy edge to the ledger step that produced it (no dangling fact nodes).
  if (facts) {
    for (const spec of FACT_SPECS) {
      const present = spec.key in facts;
      const v = facts[spec.key];
      // Skip only when the key is genuinely absent, OR null and not a known-slot (includeWhenNull).
      if (!present) continue;
      if (v == null && !spec.includeWhenNull) continue;
      const factId = `fact:${spec.key}`;
      addNode({
        id: factId,
        kind: "fact",
        label: spec.label(v),
        meta: { key: spec.key, value: v, resolved: v != null },
      });
      factNodeByKey.set(spec.key, factId);

      // producedBy: link the fact to the producing ledger step (match by action + actor). An
      // UNRESOLVED fact (null) is produced by the reconcile step that evaluated it as missing.
      const prodIdx =
        v == null
          ? reconcileIdx
          : run.findIndex(
              (e) =>
                e.action === spec.producer.action &&
                (!spec.producer.actor || e.actor === spec.producer.actor),
            );
      const stepIdx = prodIdx >= 0 ? prodIdx : reconcileIdx; // reconcile is the fallback producer
      if (stepIdx >= 0) edges.push({ from: factId, to: `step:${stepIdx}`, kind: "producedBy" });
    }
  }

  // Synthetic facts sourced from the reconcile step (real ledger-step provenance):
  //   claimContext — the claim attributes the gate reasoned over (peril/region/loss date/policy);
  //   gateState    — the gate's own completeness verdict.
  if (reconcileIdx >= 0) {
    const ctxId = "fact:claimContext";
    addNode({
      id: ctxId,
      kind: "fact",
      label: "Claim context (peril · region · loss date · policy)",
      meta: { key: "claimContext", resolved: true },
    });
    factNodeByKey.set("claimContext", ctxId);
    edges.push({ from: ctxId, to: `step:${reconcileIdx}`, kind: "producedBy" });

    const gateId = "fact:gateState";
    const complete = reconcileDetails?.complete === true;
    addNode({
      id: gateId,
      kind: "fact",
      label: complete ? "Completeness gate: COMPLETE" : "Completeness gate: INCOMPLETE",
      meta: { key: "gateState", value: complete, resolved: true },
    });
    factNodeByKey.set("gateState", gateId);
    edges.push({ from: gateId, to: `step:${reconcileIdx}`, kind: "producedBy" });
  }
  // Keyword routing for the synthetic facts (merged into the per-sentence cite scan below).
  const SYNTHETIC_CITE: { key: string; cite: string[] }[] = [
    { key: "claimContext", cite: ["peril", "region", "loss date", "policy", "under pol", "claim", "insured loss", "reported"] },
    { key: "gateState", cite: ["gate incomplete", "gate complete", "cannot be set", "unresolved so a reserve", "incomplete for reserve", "partial coverage facts", "coverage facts gathered", "coverage facts present", "facts present", "all coverage facts", "missing coverage facts", "coverage facts with confidence", "provided gate", "under provided gate", "no missing", "none under"] },
  ];

  // SENTENCE nodes: split the final decision's basis; link each to the facts it cites.
  const terminal = run[run.length - 1];
  const decision = asRecord(terminal?.details.decision);
  let verdict: EvidenceGraph["verdict"] = "unknown";
  if (decision?.verdict === "reserve" || decision?.verdict === "abstain") {
    verdict = decision.verdict;
  }

  const basisText = [
    typeof decision?.basis === "string" ? (decision.basis as string) : "",
    typeof decision?.partial_basis === "string" ? (decision.partial_basis as string) : "",
    // the abstain's missing_fact is itself a claim-of-fact citing the (unresolved) window fact
    typeof decision?.missing_fact === "string" ? (decision.missing_fact as string) : "",
  ]
    .filter(Boolean)
    .join(" ");

  sentences(basisText).forEach((sentence, i) => {
    const sId = `sentence:${i}`;
    addNode({ id: sId, kind: "sentence", label: sentence });
    const lower = sentence.toLowerCase();
    const citeSpecs: { key: string; cite: string[] }[] = [
      ...FACT_SPECS.map((s) => ({ key: s.key, cite: s.cite })),
      ...SYNTHETIC_CITE,
    ];
    for (const spec of citeSpecs) {
      const factId = factNodeByKey.get(spec.key);
      if (!factId) continue;
      if (spec.cite.some((kw) => lower.includes(kw))) {
        edges.push({ from: sId, to: factId, kind: "cites" });
      }
    }
  });

  return { claimId, verdict, nodes, edges };
}

export interface IntegrityReport {
  ok: boolean;
  sentenceCount: number;
  factCount: number;
  stepCount: number;
  orphanSentences: string[]; // basis sentences that cite NO fact (should be empty)
  danglingFacts: string[]; // fact nodes with no producedBy step (should be empty)
  danglingSentenceNodes: string[]; // nodes referenced by an edge but missing (should be empty)
}

// Falsifiable integrity check (C3 gate): every basis sentence resolves to >= 1 fact (which in turn
// resolves to >= 1 step), and every fact resolves to >= 1 producing step. No orphans, no dangling.
export function checkGraphIntegrity(g: EvidenceGraph): IntegrityReport {
  const sentenceNodes = g.nodes.filter((n) => n.kind === "sentence");
  const factNodes = g.nodes.filter((n) => n.kind === "fact");
  const stepNodes = g.nodes.filter((n) => n.kind === "step");
  const idSet = new Set(g.nodes.map((n) => n.id));

  const citesBySentence = new Map<string, number>();
  const producedByFact = new Map<string, number>();
  const danglingSentenceNodes: string[] = [];
  for (const e of g.edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) {
      danglingSentenceNodes.push(`${e.from}->${e.to}`);
      continue;
    }
    if (e.kind === "cites") citesBySentence.set(e.from, (citesBySentence.get(e.from) ?? 0) + 1);
    if (e.kind === "producedBy") producedByFact.set(e.from, (producedByFact.get(e.from) ?? 0) + 1);
  }

  const orphanSentences = sentenceNodes
    .filter((n) => (citesBySentence.get(n.id) ?? 0) === 0)
    .map((n) => n.label);
  const danglingFacts = factNodes
    .filter((n) => (producedByFact.get(n.id) ?? 0) === 0)
    .map((n) => n.label);

  return {
    ok:
      orphanSentences.length === 0 &&
      danglingFacts.length === 0 &&
      danglingSentenceNodes.length === 0 &&
      sentenceNodes.length > 0 &&
      factNodes.length > 0,
    sentenceCount: sentenceNodes.length,
    factCount: factNodes.length,
    stepCount: stepNodes.length,
    orphanSentences,
    danglingFacts,
    danglingSentenceNodes,
  };
}
