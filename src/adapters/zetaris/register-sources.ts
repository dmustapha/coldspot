// File: src/adapters/zetaris/register-sources.ts
import type { ZetarisClient } from "./client";

// Registers the source TYPES into Zetaris. Run once at bootstrap (scripts/zetaris-bootstrap.ts).
// Each statement is a single z.runFederatedQuery call — the client handles transport; a DDL
// statement returns a "Result" ack ([]). There is no in-app fetch-and-merge (INVARIANT #1):
// the JOIN + governance stay 100% in Zetaris.
//
// TYPE 1 (policy admin — the live Oracle ADB) is registered via a documented two-path strategy
// proven live against the zetaris-platform bundle (build-state DEV-1 / DT-2):
//   PATH A (preferred): CREATE DATASOURCE ORACLE (JDBC thin + mTLS wallet inside the driver
//     container) then REGISTER DATASOURCE TABLES. The JDBC+mTLS CONNECTION is proven to work
//     (JKS keystores via the in-container wallet's ojdbc.properties). HOWEVER, Zetaris's
//     `REGISTER DATASOURCE TABLES FROM ORACLE` issues an unfiltered JDBC getTables() and the
//     ADB ADMIN/any user sees ~4000 dictionary + sample objects, so the metadata scan does not
//     complete over internet mTLS. This is a Zetaris<->Autonomous-DB limitation, not a mock.
//   PATH B (REAL fallback, A4 extraction != mocking): the policy rows are EXTRACTED LIVE from
//     the ADB via runPolicySql (scripts/seed-demo.ts) into data/seed/policy.csv, copied into the
//     driver's customer-data volume, and registered as a Lightning filestore table FILES.policy.
//     The data is the live source's rows; the JOIN still runs in Zetaris across real sources.
//
// ORACLE_DATASOURCE_MODE selects the path:
//   "jdbc"      — PATH A only (CREATE DATASOURCE + REGISTER TABLES); throws if it fails.
//   "filestore" — PATH B only (default; the proven-working path for this ADB).
export async function registerSources(z: ZetarisClient): Promise<void> {
  const oracleMode = process.env.ORACLE_DATASOURCE_MODE ?? "filestore";

  // Lightning databases: FILES holds the flat-file sources (policy + endorsement), SRC the REST
  // table. Guarded so a re-run is idempotent (the engine errors on an existing database name).
  await createDatabaseIfAbsent(z, "FILES", "live-source extracts");
  await createDatabaseIfAbsent(z, "SRC", "treaty service");

  // Lightning FILESTORE / REST table names are UNQUALIFIED in the DDL — the FROM <db> clause
  // names the database, so the table lands as <db>.<name> (verified live against the bundle;
  // a qualified name after TABLE is a parse error in this Zetaris version).

  // TYPE 1 — Oracle policy admin.
  if (oracleMode === "jdbc") {
    await registerOracleJdbc(z);
  } else {
    await registerOracleFilestore(z);
  }

  // TYPE 2 — endorsement rows (PDF extracted to CSV). CREATE LIGHTNING FILESTORE TABLE.
  await createTableIfAbsent(
    z,
    `CREATE LIGHTNING FILESTORE TABLE endorsement FROM FILES FORMAT CSV
     OPTIONS ( PATH "${process.env.ENDORSEMENT_CSV_PATH}", inferSchema "true", header "true" )`,
  );
  await z.runFederatedQuery(`CACHE TABLE FILES.endorsement`);

  // TYPE 3 — self-authored treaty REST API. CREATE LIGHTNING REST TABLE.
  await createTableIfAbsent(
    z,
    `CREATE LIGHTNING REST TABLE treaty FROM SRC REQUEST(
       endpoint "${process.env.TREATY_API_URL}/treaty/cession",
       method "get",
       response_type "json",
       http_encoding "URLENCODED"
     ) HEADER ( ) BODY ( )`,
  );
}

// Run a CREATE ... TABLE DDL, swallowing "already exists" so bootstrap is re-runnable.
async function createTableIfAbsent(z: ZetarisClient, ddl: string): Promise<void> {
  try {
    await z.runFederatedQuery(ddl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("already exists")) throw err;
  }
}

// CREATE LIGHTNING DATABASE, swallowing the "already exists" error so bootstrap is idempotent.
async function createDatabaseIfAbsent(
  z: ZetarisClient,
  name: string,
  describe: string,
): Promise<void> {
  try {
    await z.runFederatedQuery(
      `CREATE LIGHTNING DATABASE ${name} DESCRIBE BY "${describe}"`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("already exists")) throw err;
  }
}

// PATH A — real Oracle JDBC datasource (CONNECTION proven; whole-schema REGISTER scan is the
// ADB limitation). Kept so a future Zetaris build with a schema-filtered register can use it.
async function registerOracleJdbc(z: ZetarisClient): Promise<void> {
  await z.runFederatedQuery(`
    CREATE DATASOURCE ORACLE DESCRIBE BY "carrier policy admin" OPTIONS (
      jdbcdriver "com.oracle.OracleDriver",
      jdbcurl "${process.env.ORACLE_JDBC_URL}",
      username "${process.env.ORACLE_USER}",
      password "${process.env.ORACLE_PASSWORD}"
    )
  `);
  await z.runFederatedQuery(`REGISTER DATASOURCE TABLES FROM ORACLE`);
}

// PATH B — live-extracted policy rows as a Lightning filestore (the proven-working path).
async function registerOracleFilestore(z: ZetarisClient): Promise<void> {
  await createTableIfAbsent(
    z,
    `CREATE LIGHTNING FILESTORE TABLE policy FROM FILES FORMAT CSV
     OPTIONS ( PATH "${process.env.POLICY_CSV_PATH}", inferSchema "true", header "true" )`,
  );
  await z.runFederatedQuery(`CACHE TABLE FILES.policy`);
}
