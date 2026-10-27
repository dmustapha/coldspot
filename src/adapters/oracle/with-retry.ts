// File: src/adapters/oracle/with-retry.ts
// Bounded retry/backoff for the Oracle ADB cold-connect. The ADB auto-hibernates and its FIRST
// connect after idle intermittently 500s or hangs (NJS-040 queueTimeout / listener redirect stall).
// This is an infra transient, NOT a verdict defect. Previously only hero-prerun retried (in its own
// postJson); the raw /api/claim/resolve route did not, so a judge's FIRST click could 500. This
// helper is the SINGLE shared cold-connect guard used by the route, hero-prerun, and verify-claims.

const DEFAULT_ATTEMPTS = 4;

function isRetryable(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toUpperCase();
  // Oracle cold-connect / hibernation transients + generic timeouts. A genuine query/logic error
  // (ORA-00942 table missing, bind errors) is NOT retried.
  return (
    m.includes("NJS-040") || // connection request timeout (pool queue)
    m.includes("NJS-500") || // internal/transport
    m.includes("NJS-510") || // connection refused / network
    m.includes("DPI-1080") || // connection closed
    m.includes("ORA-12170") || // TNS connect timeout
    m.includes("ORA-12541") || // no listener
    m.includes("ORA-12514") || // listener does not know service (ADB still waking)
    m.includes("ETIMEDOUT") ||
    m.includes("ECONNRESET") ||
    m.includes("ECONNREFUSED") ||
    m.includes("CONNECT TIMEOUT") ||
    m.includes("TIMEOUT")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Run an Oracle operation with bounded exponential backoff over cold-connect transients. Fails fast
// (re-throws) on a non-retryable error. Backoff: 1s, 2s, 3s between the 4 attempts.
// retryAll=true retries on ANY error regardless of message — use this ONLY for the
// connection-acquisition phase (getConnection), which is transient by nature when the ADB is waking
// from hibernation. The thin-mode cold-connect error string is not stable across failure modes
// (TLS listener-redirect stall, service-not-yet-registered, connectTimeout), so message-matching
// there is fragile — acquiring a connection is the right granularity to retry unconditionally.
// A genuine config/auth fault surfaces at createPool, not at per-connection acquisition.
export async function withOracleRetry<T>(
  fn: () => Promise<T>,
  label = "oracle",
  attempts = DEFAULT_ATTEMPTS,
  retryAll = false,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if ((!retryAll && !isRetryable(err)) || i === attempts) throw err;
      const wait = 1000 * i;
      // eslint-disable-next-line no-console
      console.warn(
        `[oracle:${label}] transient connect fault (attempt ${i}/${attempts}): ${
          err instanceof Error ? err.message : String(err)
        } — retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}
