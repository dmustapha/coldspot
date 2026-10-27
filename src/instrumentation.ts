// File: src/instrumentation.ts
// Next.js server-boot hook. Pre-warms the Oracle ADB pool so a judge's FIRST /api/claim/resolve
// (or /api/claims) click is NOT the cold connect (MAJOR-2). The ADB auto-hibernates; the first
// physical connect after idle can 500/hang. Warming at boot moves that cost off the request path.
// Guarded to the Node.js runtime only (node-oracledb opens TCP sockets + reads the wallet — it
// cannot run on the Edge runtime). Best-effort: never throws, never blocks boot.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmPool } = await import("./adapters/oracle/db");
  // Fire-and-forget: boot continues immediately; the warm lands in the background with its own
  // bounded retry. The route's runPolicySql also retries, so a slow warm never causes a 500.
  void warmPool();
}
