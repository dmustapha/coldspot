// File: scripts/zetaris-bootstrap.ts
// One-time federation bootstrap: register the source TYPES into Zetaris, then verify.
// INVARIANT #1 — the JOIN + governance stay 100% in Zetaris; the app performs no in-app merge.
//   TYPE 1  FILES.policy      (live Oracle ADB rows extracted to CSV — register-sources PATH B;
//                              the real-JDBC PATH A is proven to connect but the ADB whole-schema
//                              REGISTER scan does not complete — see .build-state DEV-2)
//   TYPE 2  FILES.endorsement (Lightning filestore CSV — PDF-extracted rows)
//   TYPE 3  SRC.treaty        (Lightning REST table over the self-authored treaty API)
//
// Pre-reqs:
//   - Oracle estate seeded + policy.csv exported (scripts/seed-demo.ts).
//   - COLDSPOT Next app serving the treaty API on :3100 (TREATY_API_URL reaches it from the
//     driver via host.docker.internal; colima bridge).
// This script copies the seed CSVs into the Zetaris driver's customer-data volume itself (the
// driver reads filestore PATHs from inside the container), so the bootstrap is one command.

import { execFileSync } from "node:child_process";
import { makeZetarisClient } from "../src/adapters/zetaris/client";
import { registerSources } from "../src/adapters/zetaris/register-sources";

const DRIVER = process.env.ZETARIS_DRIVER_CONTAINER ?? "zetaris-driver-1";
const SHARED = "/home/zetaris/customer-data/shared";

// docker cp a host CSV into the driver's filestore volume (best-effort: if the file is already
// there and docker cp fails, the register step surfaces any real "file not found" from Zetaris).
function copyIntoDriver(hostPath: string, name: string): void {
  try {
    execFileSync("docker", ["cp", hostPath, `${DRIVER}:${SHARED}/${name}`], { stdio: "pipe" });
    console.log(`copied ${name} -> ${DRIVER}:${SHARED}`);
  } catch (e) {
    console.warn(`WARN could not docker cp ${name}:`, (e as Error).message.split("\n")[0]);
  }
}

(async () => {
  copyIntoDriver("./data/seed/policy.csv", "policy.csv");
  copyIntoDriver("./data/seed/endorsements.csv", "endorsements.csv");

  const z = makeZetarisClient();
  await registerSources(z);
  const sources = await z.runFederatedQuery("SHOW DATASOURCES");
  const lightning = await z.runFederatedQuery("SHOW LIGHTNING DATABASES");
  console.log("datasources:", JSON.stringify(sources));
  console.log("lightning dbs:", JSON.stringify(lightning)); // expect FILES + SRC
})().catch((e) => {
  console.error("ZETARIS_BOOTSTRAP_FAILED", e);
  process.exit(1);
});
