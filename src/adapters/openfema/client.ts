// File: src/adapters/openfema/client.ts
// C2 — OpenFEMA live source (the real external 4th source). Queries the public, free, no-auth
// OpenFEMA DisasterDeclarationsSummaries endpoint for the declared CAT-event window (incident
// begin/end dates) matching a claim's state + incident type. This is an ADDITIONAL real source the
// gather step fetches and the deterministic gate reconciles — the ONE governed Zetaris query
// invariant (INVARIANT #1) still binds the SQL/files/treaty join; OpenFEMA is logged as its own
// federate/probe step.
//
// Seeded-real fallback (demo reliability, INVARIANT-safe): if the live call fails/times out, fall
// back to a window seeded FROM a REAL prior OpenFEMA response (captured 2026-10-24: Hurricane Milton
// DR-4844-FL, 2024-10-05..2024-11-02). This is real data, deterministic — NEVER a fabricated window.
// The result TRUTHFULLY records which path was used so the ledger never overstates liveness.

export interface CatWindowResult {
  open: string; // ISO YYYY-MM-DD incidentBeginDate
  close: string; // ISO YYYY-MM-DD incidentEndDate
  source: "live" | "seeded-real"; // TRUTHFUL provenance — never fabricated
  declarationString?: string;
  declarationTitle?: string;
  incidentType?: string;
  state?: string;
  detail: string; // human-readable provenance line for the ledger
}

interface DeclarationSummary {
  femaDeclarationString?: string;
  declarationTitle?: string;
  incidentType?: string;
  state?: string;
  incidentBeginDate?: string;
  incidentEndDate?: string;
}

const OPENFEMA_BASE = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";

// A REAL prior OpenFEMA response captured 2026-10-24 (the live API returned this exact record). Used
// ONLY when the live call is unavailable — it is real declared-disaster data, never invented.
const SEEDED_REAL: DeclarationSummary = {
  femaDeclarationString: "DR-4844-FL",
  declarationTitle: "HURRICANE MILTON",
  incidentType: "Hurricane",
  state: "FL",
  incidentBeginDate: "2024-10-05T00:00:00.000Z",
  incidentEndDate: "2024-11-02T00:00:00.000Z",
};

function isoDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

// Build the OData query: newest declared window for the state + incident type, with the fields we need.
function buildUrl(state: string, incidentType: string): string {
  const filter = `state eq '${state}' and incidentType eq '${incidentType}'`;
  const params = new URLSearchParams({
    $filter: filter,
    $top: "1",
    $orderby: "incidentBeginDate desc",
    $select:
      "femaDeclarationString,declarationTitle,incidentType,state,incidentBeginDate,incidentEndDate",
  });
  return `${OPENFEMA_BASE}?${params.toString()}`;
}

function toResult(d: DeclarationSummary, source: "live" | "seeded-real"): CatWindowResult | null {
  const open = isoDate(d.incidentBeginDate);
  const close = isoDate(d.incidentEndDate);
  if (!open || !close) return null; // open-ended declaration -> cannot supply a closed window
  return {
    open,
    close,
    source,
    declarationString: d.femaDeclarationString,
    declarationTitle: d.declarationTitle,
    incidentType: d.incidentType,
    state: d.state,
    detail:
      source === "live"
        ? `live OpenFEMA DisasterDeclarationsSummaries: ${d.femaDeclarationString} "${d.declarationTitle}" ${open}..${close}`
        : `seeded-real fallback (real prior OpenFEMA response): ${d.femaDeclarationString} "${d.declarationTitle}" ${open}..${close}`,
  };
}

// Fetch the declared CAT window for a claim's region + incident type. Tries the LIVE API first;
// on any failure/timeout/empty result, falls back to the seeded-real window and says so truthfully.
export async function fetchCatWindow(
  state: string,
  incidentType: string,
  opts?: { timeoutMs?: number },
): Promise<CatWindowResult> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let data: { DisasterDeclarationsSummaries?: DeclarationSummary[] };
    try {
      const res = await fetch(buildUrl(state, incidentType), {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`OpenFEMA HTTP ${res.status}`);
      data = (await res.json()) as { DisasterDeclarationsSummaries?: DeclarationSummary[] };
    } finally {
      clearTimeout(t);
    }
    const first = data.DisasterDeclarationsSummaries?.[0];
    const live = first ? toResult(first, "live") : null;
    if (live) return live;
    // Live call succeeded but returned no closed window for this state/type -> seeded-real fallback.
  } catch {
    // Live call failed/timed out -> seeded-real fallback (logged truthfully below).
  }
  const seeded = toResult(SEEDED_REAL, "seeded-real");
  // SEEDED_REAL always has a closed window, so this is non-null; the cast documents that invariant.
  return seeded as CatWindowResult;
}

// Map a claim's peril to the OpenFEMA incidentType vocabulary. Defaults to "Hurricane" (the demo CAT),
// but a wind/storm/flood/fire peril maps to its FEMA incident type so the live window is claim-relevant.
export function perilToIncidentType(peril: string): string {
  const p = peril.toLowerCase();
  if (p.includes("hurricane")) return "Hurricane";
  if (p.includes("flood")) return "Flood";
  if (p.includes("fire")) return "Fire";
  if (p.includes("tornado")) return "Tornado";
  if (p.includes("wind") || p.includes("storm")) return "Hurricane";
  return "Hurricane";
}
