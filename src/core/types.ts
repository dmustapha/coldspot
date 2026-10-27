// File: src/core/types.ts
// Deterministic core. Imports nothing from adapters/probes/app.

export type Workflow = "reserve-decide" | "coverage-check" | "abstain-triage";

export interface ClaimContext {
  claimId: string;
  policyId: string;
  peril: string; // e.g. "fire"
  lossDate: string; // ISO date
  region: string;
  reportedAmount?: number;
}

// C3 source breadth: the catalog spans HETEROGENEOUS source TYPES. `type` is the surface shape
// (how the data arrives); `probeKind` is HOW relevance is discovered from live signals:
//   - "zetaris": DESCRIBE/COUNT/MAX against the federated Lightning name (sql/docs/treaty REST).
//   - "api":     a live external REST fetch (OpenFEMA) whose returned record is the relevance signal.
//   - "vision":  a vision-extractable document (damage photo / FEMA report image) — relevance is
//                whether the claim carries that evidence to read.
// Only sql/docs/treaty (probeKind "zetaris") participate in the ONE governed Zetaris join; "api" and
// "vision" sources are additional REAL sources fetched by the orchestrator and reconciled the same way.
export interface SourceDescriptor {
  id: string; // e.g. "oracle_policy", "treaty_api", "endorsement_rows", "openfema", "damage_photo", "legacy_notes"
  type: "sql" | "docs" | "api" | "image";
  probeKind: "zetaris" | "api" | "vision";
  zetarisName: string; // qualified name in Lightning SQL (zetaris probeKind), else a logical id
  label: string;
}

export interface ProbeSignals {
  schemaMatch: boolean; // has columns relevant to the claim
  lastRefreshIso: string | null;
  freshnessDays: number | null;
  rowCoverage: number; // rows matching this claim's policy_id
  // C3 cross-type signals (null/absent for zetaris sources; populated per probeKind):
  // "api" → did the live external fetch return a usable record for this claim's region/peril?
  apiRecordReturned?: boolean | null;
  apiDetail?: string | null; // the live signal text (window found, provenance, or why not)
  // "vision" → does the claim carry the document this source reads?
  evidencePresent?: boolean | null;
  evidenceKind?: string | null; // which image (damage photo / declaration report)
}

export interface ProbeResult {
  sourceId: string;
  relevant: boolean;
  score: number; // 0..1
  reason: string; // BUILT FROM signals at runtime — never a constant
  signals: ProbeSignals;
  status: "relevant" | "discarded" | "unavailable" | "indeterminate";
}

export interface FederatedRow {
  [column: string]: unknown;
}

export interface CoverageFacts {
  baseLimit?: number;
  endorsementSublimit?: number;
  endorsementPeril?: string;
  treatyCessionPct?: number;
  treatyCatSublimit?: number;
  reportedAmount?: number; // claim's reported loss amount (caps gross exposure in computeReserve)
  catWindow?: { open: string; close: string } | null;
  lossInsideCatWindow?: boolean | null; // null = ambiguous = the missing-fact trigger
  visionFacts?: VisionFacts | null;
  // C2 per-fact confidence: probe signal strength -> confidence per coverage fact. Surfaced in the
  // ledger for provenance; NEVER an input to the gate (isComplete stays binary — engine-as-truth).
  factConfidence?: Record<string, number>;
}

// Facts a Nemotron VL read can extract from claim evidence. The damage-photo read supplies
// {damageType, date, amount, perilMatch}; the FEMA-report read supplies the declared CAT-event
// window {catWindowOpen, catWindowClose, catEventName}. C1 HERO SEAM: when the federated treaty
// row has an open-ended CAT window (cat_event_close:null -> lossInsideCatWindow:null -> abstain),
// a GENUINE vision read of a FEMA declaration supplies catWindowClose, which toCoverageFacts
// synthesizes into a complete catWindow -> the gate resolves -> reserve. The read is never
// hardcoded: mutate the report image and the extracted close date changes.
export interface VisionFacts {
  damageType?: string;
  date?: string;
  amount?: number;
  confidence?: number; // C2: per-vision-fact confidence (already present; documented for C2 surfacing)
  // FEMA-report read (CAT-event window the model extracts from the declaration image).
  catWindowOpen?: string;
  catWindowClose?: string;
  catEventName?: string;
  // Damage-photo read: does the observed damage match the claim's declared peril?
  perilMatch?: boolean;
}

export type Verdict = "reserve" | "abstain";

export interface ReserveDecision {
  verdict: "reserve";
  amount: number;
  currency: "USD";
  basis: string; // cites the coverage facts used
}

export interface Abstention {
  verdict: "abstain";
  missing_fact: string; // REQUIRED, specific — never "low confidence"
  resolving_source: string; // REQUIRED — where to get the missing fact
  partial_basis: string;
  // C2 COUNTERFACTUAL (additive, non-breaking): "if {ifFact} were known, the engine would reserve
  // $thenAmount". thenAmount is deterministicReserve() over a HYPOTHETICAL-complete copy of the facts
  // — a pure function of facts the gate already produced, never an override of the abstain verdict.
  counterfactual?: {
    ifFact: string;
    thenVerdict: "reserve";
    thenAmount: number;
  };
}

export type Decision = ReserveDecision | Abstention;

// C2 MARKOVIAN bounded RunState (Track 03): the per-step working state the orchestrator threads is a
// FIXED-SHAPE bound — its serialized size is constant regardless of catalog/source count (counts +
// the current facts snapshot, never an unbounded accumulation of per-source payloads). A long run
// stays flat-cost; the bound is a verifiable property (see orchestrator.ts runStateFootprint).
export interface RunState {
  claimId: string;
  stage: "plan" | "probe" | "gather" | "vision" | "reconcile" | "verify" | "decide";
  probedCount: number; // how many sources probed so far (count, not the probe payloads)
  confirmedCount: number; // how many probes confirmed relevant (count, not the descriptors)
  facts: CoverageFacts | null; // the single current reconciled-facts snapshot (fixed shape; overwritten, never appended)
  complete: boolean | null; // the gate verdict once reconcile has run, else null
}

export type LedgerAction =
  | "probe"
  | "discard"
  | "federate"
  | "reconcile"
  | "vision"
  | "verify" // C2: post-reconcile re-derivation that must AGREE with the gate (gate wins on disagreement)
  | "counterfactual" // C2: on abstain, the deterministic "if the missing fact were known, reserve $Z"
  | "gate-override"
  | "decide"
  | "abstain";

export interface LedgerStep {
  memoryId: string; // claimId
  action: LedgerAction;
  actor: string; // "orchestrator" | "nemotron" | "zetaris" | "probe"
  timestamp: number;
  details: Record<string, unknown>; // what was queried/used/REFUSED + why
}
