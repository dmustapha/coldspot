// File: src/adapters/catalog.ts
import type { SourceDescriptor } from "../core/types";

// The seeded source catalog the agent probes — C3 FRAGMENTATION BREADTH: six HETEROGENEOUS
// source TYPES across four surface shapes (sql · docs · api · image) and three discovery kinds
// (zetaris · api · vision). Includes a DECOY (legacy_notes) that is discarded by real probe
// signals — proving discovery is not a hardcoded relevant-list.
//
// Only the "zetaris" probeKind sources (oracle_policy, endorsement_rows, treaty_api) participate
// in the ONE governed Zetaris federated join (INVARIANT #1). "openfema" (live REST) and
// "damage_photo" (vision read) are ADDITIONAL REAL sources the orchestrator fetches and reconciles
// the same deterministic way — each discovered from its OWN live signal, each logged as its own step.
//
// zetarisName values match the LIVE registrations (DEV-2): the carrier policy admin is extracted
// live from the ADB into FILES.policy (A4 real-fallback), so the probe queries the real registered
// federated name. For non-zetaris kinds the field is a logical id (no Lightning name exists).
const CATALOG: SourceDescriptor[] = [
  { id: "oracle_policy",    type: "sql",   probeKind: "zetaris", zetarisName: "FILES.policy",       label: "Policy admin (Oracle, federated)" },
  { id: "endorsement_rows", type: "docs",  probeKind: "zetaris", zetarisName: "FILES.endorsement",  label: "Manuscript endorsements (filestore)" },
  { id: "treaty_api",       type: "api",   probeKind: "zetaris", zetarisName: "SRC.treaty",         label: "Reinsurance treaty (REST, federated)" },
  { id: "openfema",         type: "api",   probeKind: "api",     zetarisName: "openfema.declarations", label: "FEMA disaster declarations (live API)" },
  { id: "damage_photo",     type: "image", probeKind: "vision",  zetarisName: "vision.evidence",    label: "Damage photo / FEMA report (vision)" },
  { id: "legacy_notes",     type: "sql",   probeKind: "zetaris", zetarisName: "FILES.legacy_notes", label: "Legacy claim notes (decoy)" },
];

export async function listCatalog(_claimId: string): Promise<SourceDescriptor[]> {
  return CATALOG;
}

// How many distinct heterogeneous source TYPES the catalog spans (C3 gate asserts >= 5 probed).
// Heterogeneity = the distinct (surface-shape × discovery-kind) pairs: a treaty REST table federated
// THROUGH Zetaris (api/zetaris) is a different system type from a REST API fetched DIRECTLY
// (api/api), and an image read by vision (image/vision) is different again. The six catalog sources
// span five such types: sql/zetaris · docs/zetaris · api/zetaris · api/api · image/vision.
export function catalogTypeKey(s: { type: string; probeKind: string }): string {
  return `${s.type}/${s.probeKind}`;
}
export function catalogTypeCount(): number {
  return new Set(CATALOG.map(catalogTypeKey)).size;
}
