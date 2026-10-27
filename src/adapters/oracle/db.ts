// File: src/adapters/oracle/db.ts
// Oracle ADB adapter (§10). node-oracledb THIN mode + mTLS wallet (configDir=walletDir).
// NOTE (§N+13): every consumer of this module (routes, the Trust Ledger) MUST declare
//   export const runtime = "nodejs"
// node-oracledb opens TCP sockets and reads the wallet from disk — impossible on Edge.

import oracledb from "oracledb";
import type {
  Pool,
  Connection,
  BindParameters,
  ExecuteOptions,
} from "oracledb";
import type { LedgerStep } from "../../core/types";
import { withOracleRetry } from "./with-retry";

let pool: Pool | null = null;
let ledgerTableReady = false;

// THIN-mode pool. configDir points at the ADB wallet dir (TNS alias resolves from tnsnames.ora).
export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING, // ADB TNS alias from wallet
    configDir: process.env.ORACLE_WALLET_DIR, // THIN mode reads tnsnames.ora here
    // THIN-mode mTLS to this ADB requires the password-protected PEM to be
    // DECRYPTED: configDir-only (SSO cwallet) stalls at the TLS layer on the
    // listener redirect, while walletLocation + walletPassword succeeds.
    // (PROVEN: SELECT 1 FROM dual -> [[1,"G466AD08A6A5AAC_COLDSPOT"]].)
    walletLocation: process.env.ORACLE_WALLET_DIR,
    walletPassword: process.env.ORACLE_WALLET_PASSWORD,
    // poolMin 2: keep two physical connections open so a single slow/dropped one never forces
    // the request path onto a cold connect. The keepalive (startKeepalive) pings them so the ADB
    // does not hibernate during the judging window.
    poolMin: 2,
    poolMax: 4,
    // Fail the mirror fast (5s) when ADB is unreachable instead of hanging 60s —
    // the JSONL append is primary, the Oracle mirror is best-effort (O2).
    queueTimeout: 5000,
    // Fail a COLD physical connect fast instead of hanging ~178s on the listener redirect when
    // the ADB is waking from hibernation — the hang then becomes a fast, retryable transient that
    // withOracleRetry rides out with backoff (MAJOR-2). connectTimeout (per-connect, 10s) +
    // transportConnectTimeout (TCP establish, 8s) are node-oracledb 6.x thin-mode attrs not yet in
    // the installed @types; passed via a typed extension so tsc stays clean.
    ...({ connectTimeout: 10, transportConnectTimeout: 8 } as object),
  });
  return pool;
}

// Acquire a connection, retrying ANY failure (retryAll) with bounded backoff. Connection
// acquisition against a hibernating ADB fails transiently in several shapes (TLS listener-redirect
// stall, ORA-12514 service-not-yet-registered, connectTimeout) whose error strings are not stable —
// so we retry the ACQUISITION unconditionally rather than depend on message-matching (which let a
// cold-connect 500 leak to the route: MAJOR-2). Query errors are NOT retried (caller runs them
// after the connection is live).
async function getConnectionResilient(label: string): Promise<Connection> {
  const p = await getPool();
  return withOracleRetry(() => p.getConnection(), label, 5, true);
}

let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

// Keep the ADB + pool warm so no request ever pays the cold-wake cost (the 64-77s spikes + the
// cold-connect 500). Always-Free ATP auto-hibernates on idle; a light periodic ping keeps it live
// through the demo/judging window. Idempotent; unref'd so it never holds the process open.
function startKeepalive(): void {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    void (async () => {
      try {
        const conn = await getConnectionResilient("keepalive");
        try {
          await conn.execute("SELECT 1 FROM dual");
        } finally {
          await conn.close();
        }
      } catch {
        // best-effort; the next request's own resilient acquire will ride out a transient
      }
    })();
  }, 60_000);
  keepaliveTimer.unref?.();
}

// Pre-warm the pool so the FIRST real request is not the cold connect. Called on server boot
// (instrumentation.ts). Best-effort: a failure here just means the first request pays the
// (now-retried, bounded) cold-connect cost itself — it never blocks boot or throws.
export async function warmPool(): Promise<void> {
  try {
    const conn = await getConnectionResilient("warm");
    try {
      await conn.execute("SELECT 1 FROM dual");
    } finally {
      await conn.close();
    }
    startKeepalive();
    // eslint-disable-next-line no-console
    console.log("[oracle] pool pre-warmed on boot; keepalive started");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `[oracle] pool pre-warm skipped (${e instanceof Error ? e.message : String(e)}); first request will cold-connect with retry`,
    );
  }
}

// Run arbitrary policy SQL against ADB. binds/opts pass straight through to node-oracledb.
export async function runPolicySql<T = Record<string, unknown>>(
  sql: string,
  binds: BindParameters = {},
  opts: ExecuteOptions = {},
): Promise<T[]> {
  // Resilient cold-connect (MAJOR-2): getConnection is where the ADB cold-start 500s/hangs, so it
  // is retried unconditionally; the SELECT itself is not retried once a connection is live.
  const conn = await getConnectionResilient("runPolicySql");
  try {
    const result = await conn.execute<T>(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...opts,
    });
    return result.rows ?? [];
  } finally {
    await conn.close();
  }
}

// Create the append-only ledger mirror table if it does not exist (idempotent).
// Oracle has no CREATE TABLE IF NOT EXISTS, so we trap ORA-00955 (name already used).
async function ensureLedgerTable(conn: Connection): Promise<void> {
  if (ledgerTableReady) return;
  const ddl = `CREATE TABLE trust_ledger (
    id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    claim_id   VARCHAR2(128) NOT NULL,
    action     VARCHAR2(64)  NOT NULL,
    actor      VARCHAR2(64)  NOT NULL,
    ts         NUMBER        NOT NULL,
    details    CLOB,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP
  )`;
  try {
    await conn.execute(ddl);
  } catch (err) {
    // ORA-00955: name is already used by an existing object — table exists, that's fine.
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("ORA-00955")) throw err;
  }
  ledgerTableReady = true;
}

// Durable Trust Ledger mirror (O2). Append-only INSERT; replay can read from here if JSONL is lost.
export async function mirrorLedgerToOracle(step: LedgerStep): Promise<void> {
  const conn = await getConnectionResilient("mirrorLedger");
  try {
    await ensureLedgerTable(conn);
    await conn.execute(
      `INSERT INTO trust_ledger (claim_id, action, actor, ts, details)
       VALUES (:claimId, :action, :actor, :ts, :details)`,
      {
        claimId: step.memoryId,
        action: step.action,
        actor: step.actor,
        ts: step.timestamp,
        details: JSON.stringify(step.details),
      },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
