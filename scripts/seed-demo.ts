// File: scripts/seed-demo.ts
// Seed the demo estate into Oracle ADB (TYPE 1 federation source), then leave a
// clear seam to PRE-RUN the hero claim through the real orchestrator once it exists
// (P4.1 — EARNED Trust Ledger, INVARIANT #5; the orchestrator is NOT a blocker here).
//
// What lands in Oracle:
//   - policy       : hero POL-1001 (peril fire, base_limit 5,000,000) + texture policies.
//   - legacy_notes : the decoy source (last_refresh 2019, 0 rows matching POL-1001) so
//                    the discovery probe's discard target is REAL (R2), not simulated.
// What does NOT land in Oracle (by design — they are the OTHER two federation TYPES):
//   - endorsement rows -> data/seed/endorsements.csv (TYPE 2 Lightning filestore).
//   - treaty cession rows -> self-authored treaty API / src/data/treaties.json (TYPE 3 REST).
//
// Idempotent: Oracle has no CREATE TABLE IF NOT EXISTS, so CREATE traps ORA-00955 like
// db.ts does; rows are re-seeded by DELETE-then-INSERT so a re-run is deterministic.

import { writeFileSync } from "node:fs";
import oracledb from "oracledb";
import type { Connection } from "oracledb";
import { getPool } from "../src/adapters/oracle/db";

// Index signature so a PolicySeed is directly usable as oracledb BindParameters (its keys are
// the named bind vars :policy_id..:expiry).
interface PolicySeed {
  policy_id: string;
  base_limit: number;
  peril: string;
  inception: string; // ISO date
  expiry: string; // ISO date
  [bind: string]: string | number;
}

// Hero first, then texture. POL-1001 is the engineered fire claim (CLM-4471).
const POLICIES: PolicySeed[] = [
  { policy_id: "POL-1001", base_limit: 5_000_000, peril: "fire", inception: "2026-01-01", expiry: "2026-12-31" },
  { policy_id: "POL-1002", base_limit: 3_000_000, peril: "wind", inception: "2024-01-01", expiry: "2024-12-31" },
  { policy_id: "POL-1003", base_limit: 2_500_000, peril: "wind", inception: "2022-01-01", expiry: "2022-12-31" },
  { policy_id: "POL-1004", base_limit: 4_000_000, peril: "wind", inception: "2021-01-01", expiry: "2021-12-31" },
  { policy_id: "POL-1005", base_limit: 1_500_000, peril: "water", inception: "2026-01-01", expiry: "2026-12-31" },
  { policy_id: "POL-1006", base_limit: 2_000_000, peril: "fire", inception: "2026-01-01", expiry: "2026-12-31" },
  { policy_id: "POL-1007", base_limit: 6_000_000, peril: "fire", inception: "2026-01-01", expiry: "2026-12-31" },
];

// CREATE TABLE, trapping ORA-00955 (name already used) so a re-run is a no-op (db.ts pattern).
async function createTable(conn: Connection, ddl: string): Promise<void> {
  try {
    await conn.execute(ddl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("ORA-00955")) throw err;
  }
}

// policy: the carrier policy-admin table. The federated JOIN reads ORACLE.policy p.
async function seedPolicies(conn: Connection): Promise<void> {
  await createTable(
    conn,
    `CREATE TABLE policy (
      policy_id  VARCHAR2(32) PRIMARY KEY,
      base_limit NUMBER       NOT NULL,
      peril      VARCHAR2(32) NOT NULL,
      inception  DATE         NOT NULL,
      expiry     DATE         NOT NULL
    )`,
  );
  await conn.execute(`DELETE FROM policy`);
  for (const p of POLICIES) {
    await conn.execute(
      `INSERT INTO policy (policy_id, base_limit, peril, inception, expiry)
       VALUES (:policy_id, :base_limit, :peril,
               TO_DATE(:inception, 'YYYY-MM-DD'), TO_DATE(:expiry, 'YYYY-MM-DD'))`,
      p,
    );
  }
}

// claim: the claims intake table. The resolve route loads a ClaimContext from here.
// The demo estate shows EVERY outcome of discover->federate->{reserve | abstain}, all from
// REAL federated facts — the verdict is the deterministic gate's, never a hardcoded value:
//
//   CLM-4471  HERO ABSTAIN  -> POL-1001 fire, loss 2026-09-14 FL. Endorsement + treaty both
//             federate, but the treaty CAT window has cat_event_close:null -> lossInsideCatWindow
//             stays null -> gate incomplete -> abstain naming the missing CAT-window fact.
//   CLM-7781  RESERVE       -> POL-1002 wind, loss 2024-09-26 FL (inside Hurricane Helene window
//             2024-09-24..09-28). All four coverage facts present + loss confirmed in-window ->
//             gate COMPLETE -> deterministic reserve. Reported 900,000 < binding limit 3,000,000,
//             net 50% treaty cession -> net case reserve 450,000 (computeReserve, pure function).
//   CLM-9002  ABSTAIN (2nd) -> POL-1005 water, loss 2026-05-01 CA. POL-1005 has an endorsement row
//             but NO treaty row, so the governed INNER JOIN federates zero rows -> the gate's FIRST
//             missing fact is "base policy limit" (a DIFFERENT missing fact than CLM-4471's) ->
//             abstain. Shows the range: a load-bearing source that never federated at all.
// Book-filling claims (DESIGN-HANDOFF contract wants >= 8 queue rows). Each reuses an ALREADY-
// wired policy so the verdict is the SAME real federated gate (no new Zetaris filestore data):
//   CLM-5126       RESERVE   -> POL-1002 wind (Helene window 2024-09-24..28). A second claim from
//                  the SAME CAT event, inside the window -> deterministic reserve at a different
//                  reported amount (a real "one hurricane, many claims" book).
//   CLM-3310       RESERVE   -> POL-1003 wind, loss 2022-09-29 (inside Hurricane Ian 09-28..30,
//                  cession 35%). A second reserve basis / reinsurance structure.
//   CLM-2207       ABSTAIN   -> POL-1001 fire, loss 2026-09-16 (CAT window OPEN, close pending ->
//                  lossInsideCatWindow null). Grows the "CAT-window" cold-spot cluster to 2 claims
//                  in the portfolio (systemic gap, not a one-off).
const CLAIMS = [
  { claim_id: "CLM-4471", policy_id: "POL-1001", peril: "fire", loss_date: "2026-09-14", region: "FL", reported_amount: 1_250_000 },
  { claim_id: "CLM-7781", policy_id: "POL-1002", peril: "wind", loss_date: "2024-09-26", region: "FL", reported_amount: 900_000 },
  { claim_id: "CLM-9002", policy_id: "POL-1005", peril: "water", loss_date: "2026-05-01", region: "CA", reported_amount: 400_000 },
  { claim_id: "CLM-4480", policy_id: "POL-1006", peril: "fire", loss_date: "2026-08-02", region: "TX", reported_amount: 300_000 },
  { claim_id: "CLM-4495", policy_id: "POL-1007", peril: "fire", loss_date: "2026-07-20", region: "CA", reported_amount: 900_000 },
  { claim_id: "CLM-5126", policy_id: "POL-1002", peril: "wind", loss_date: "2024-09-27", region: "FL", reported_amount: 640_000 },
  { claim_id: "CLM-3310", policy_id: "POL-1003", peril: "wind", loss_date: "2022-09-29", region: "FL", reported_amount: 1_400_000 },
  { claim_id: "CLM-2207", policy_id: "POL-1001", peril: "fire", loss_date: "2026-09-16", region: "FL", reported_amount: 2_000_000 },
];

async function seedClaims(conn: Connection): Promise<void> {
  await createTable(
    conn,
    `CREATE TABLE claim (
      claim_id        VARCHAR2(32) PRIMARY KEY,
      policy_id       VARCHAR2(32) NOT NULL,
      peril           VARCHAR2(32) NOT NULL,
      loss_date       DATE         NOT NULL,
      region          VARCHAR2(32) NOT NULL,
      reported_amount NUMBER
    )`,
  );
  await conn.execute(`DELETE FROM claim`);
  for (const c of CLAIMS) {
    await conn.execute(
      `INSERT INTO claim (claim_id, policy_id, peril, loss_date, region, reported_amount)
       VALUES (:claim_id, :policy_id, :peril, TO_DATE(:loss_date, 'YYYY-MM-DD'), :region, :reported_amount)`,
      c,
    );
  }
}

// legacy_notes: the decoy. Stale (last_refresh 2019) and zero rows match the hero policy,
// so the discovery probe has a REAL irrelevant source to discard (R2) — not a mock.
async function seedDecoy(conn: Connection): Promise<void> {
  await createTable(
    conn,
    `CREATE TABLE legacy_notes (
      note_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      policy_id    VARCHAR2(32),
      note         VARCHAR2(512),
      last_refresh DATE NOT NULL
    )`,
  );
  await conn.execute(`DELETE FROM legacy_notes`);
  const stale = [
    { policy_id: "POL-0007", note: "migrated from AS/400 ledger; superseded 2019", last_refresh: "2019-03-01" },
    { policy_id: "POL-0042", note: "legacy reserve note; do not use for current claims", last_refresh: "2019-03-01" },
  ];
  for (const n of stale) {
    await conn.execute(
      `INSERT INTO legacy_notes (policy_id, note, last_refresh)
       VALUES (:policy_id, :note, TO_DATE(:last_refresh, 'YYYY-MM-DD'))`,
      n,
    );
  }
}

// Read the live policy rows back and write data/seed/policy.csv with ISO dates. Columns match
// the Zetaris FILES.policy filestore + the federated JOIN (policy_id, base_limit, peril,
// inception, expiry). Operator copies it into the driver volume (see zetaris-bootstrap notes).
async function exportPolicyCsv(conn: Connection): Promise<void> {
  const r = await conn.execute<{
    POLICY_ID: string;
    BASE_LIMIT: number;
    PERIL: string;
    INCEPTION: string;
    EXPIRY: string;
  }>(
    `SELECT policy_id, base_limit, peril,
            TO_CHAR(inception,'YYYY-MM-DD') AS inception,
            TO_CHAR(expiry,'YYYY-MM-DD')    AS expiry
     FROM policy ORDER BY policy_id`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const rows = r.rows ?? [];
  const body = rows
    .map((p) => [p.POLICY_ID, p.BASE_LIMIT, p.PERIL, p.INCEPTION, p.EXPIRY].join(","))
    .join("\n");
  writeFileSync("./data/seed/policy.csv", `policy_id,base_limit,peril,inception,expiry\n${body}\n`);
  console.log(`exported data/seed/policy.csv (${rows.length} live rows for FILES.policy)`);
}

async function main(): Promise<void> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await seedPolicies(conn);
    await seedClaims(conn);
    await seedDecoy(conn);
    await conn.commit();
    const count = async (table: string): Promise<number> => {
      const r = await conn.execute<{ N: number }>(
        `SELECT COUNT(*) AS n FROM ${table}`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return r.rows?.[0]?.N ?? 0;
    };
    console.log(`seeded Oracle estate: policy=${await count("policy")} claim=${await count("claim")} legacy_notes=${await count("legacy_notes")}`);
    console.log("hero: POL-1001 (fire, base_limit 5,000,000)");

    // Extract the live policy rows -> data/seed/policy.csv (A4 extraction != mocking). This is
    // the REAL live-source data behind the Zetaris FILES.policy filestore (register-sources
    // PATH B — the proven-working TYPE 1 path for this ADB). The JOIN still runs in Zetaris.
    await exportPolicyCsv(conn);
  } finally {
    await conn.close();
  }

  // SEAM (P4.1): pre-run the hero claim CLM-4471 through the REAL orchestrator here, once
  // src/core/orchestrator.ts exists, so /demo replays an EARNED ledger (INVARIANT #5), e.g.:
  //   const { runClaim } = await import("../src/core/orchestrator");
  //   await runClaim(deps, { claimId:"CLM-4471", policyId:"POL-1001", peril:"fire",
  //                          lossDate:"2026-09-14", region:"FL" });
  // The orchestrator is not yet built; do NOT author the ledger by hand to fake earned state.
  console.log("seeded (hero pre-run seam pending orchestrator — P4.1)");
}

main().catch((e) => {
  console.error("SEED_FAILED", e);
  process.exit(1);
});
