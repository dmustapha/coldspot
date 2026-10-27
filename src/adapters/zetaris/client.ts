// File: src/adapters/zetaris/client.ts
// SPONSOR ADAPTER — the ONE internal Zetaris interface.
//
// The only query surface is runFederatedQuery(sql): there is no multi-source
// fetch-and-merge method, so an in-app join is structurally unrepresentable
// (INVARIANT #1).
//
// Contract PROVEN live against the zetaris-platform bundle (build-state DEV-1):
//   - base = the Next.js BFF on :3000 (NOT api:8888 directly)
//   - login: POST /api/auth/login { username, password } -> { ...jwt..., orgId }
//   - ONE SQL surface for SELECT *and* DDL:
//       POST /api/proxy/sql-editor/sqls/run-stream
//       body { queryId, sql, chunkSize, source:"SqlEditor" }
//       headers Authorization: Bearer, X-Org-ID, X-Request-ID
//     response = NDJSON: line 1 is a JSON array of column names, each following
//     line is a JSON array of row values. (The newer /query/sql/start is
//     SELECT-only and rejects DDL, so it is NOT used.)
import { randomUUID } from "node:crypto";

export interface ZetarisConfig {
  base: string; // BFF base, e.g. http://localhost:3000 (local Docker) or cloud URL
  apiKey?: string; // cloud; absent for local -> login flow
  orgId: string;
  user?: string; // local Docker: admin@zetaris.com
  password?: string; // local Docker: Zetaris1@
}

export interface ZetarisClient {
  runFederatedQuery(sql: string): Promise<Record<string, unknown>[]>;
}

const JWT_RE = /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;

// Resilience bound (stress H-finding): neither fetch below set a timeout, so a dead/hung Zetaris
// host made the request wait out the OS TCP connect timeout (~75s) per attempt x the route-level
// retries — a multi-minute hang before the resolve fails closed, under the "reliable decisions
// under source outage" headline. AbortSignal.timeout fails a truly-dead upstream fast enough for
// the route-level transient-retry to degrade to an honest error. 60s stays well above warm latency.
const ZETARIS_TIMEOUT_MS = Number(process.env.ZETARIS_TIMEOUT_MS ?? 60_000);

export class ZetarisRestClient implements ZetarisClient {
  private bearer: string | null;
  private orgId: string;
  constructor(private cfg: ZetarisConfig) {
    this.bearer = cfg.apiKey ?? null;
    this.orgId = cfg.orgId;
  }

  private async ensureAuth(): Promise<string> {
    if (this.bearer) return this.bearer;
    const res = await fetch(`${this.cfg.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.cfg.user,
        password: this.cfg.password,
      }),
      signal: AbortSignal.timeout(ZETARIS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ZETARIS_AUTH_FAILED ${res.status}`);
    const text = await res.text();
    const token = text.match(JWT_RE)?.[0] ?? null;
    if (!token) throw new Error("ZETARIS_AUTH_NO_TOKEN");
    const org = text.match(/"orgId"\s*:\s*(\d+)/)?.[1];
    if (org) this.orgId = org;
    this.bearer = token;
    return this.bearer;
  }

  async runFederatedQuery(sql: string): Promise<Record<string, unknown>[]> {
    const bearer = await this.ensureAuth();
    const res = await fetch(
      `${this.cfg.base}/api/proxy/sql-editor/sqls/run-stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
          "X-Org-ID": this.orgId,
          "X-Request-ID": randomUUID(),
        },
        body: JSON.stringify({
          queryId: randomUUID(),
          sql: sql.trim(),
          chunkSize: 1000,
          source: "SqlEditor",
        }),
        signal: AbortSignal.timeout(ZETARIS_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ZETARIS_QUERY_FAILED ${res.status} ${body.slice(0, 200)}`);
    }
    return parseNdjson(await res.text());
  }
}

// NDJSON -> Record[]: first non-empty line is the column header array, each
// subsequent line is a row value array zipped against the header. A single
// "["Result"]" header with no rows (DDL ack) yields []. Unparseable or error
// bodies throw so a caller never silently treats a failure as empty.
export function parseNdjson(text: string): Record<string, unknown>[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  let header: string[];
  try {
    header = JSON.parse(lines[0]) as string[];
  } catch {
    throw new Error(`ZETARIS_BAD_RESPONSE ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(header)) {
    throw new Error(`ZETARIS_BAD_RESPONSE ${text.slice(0, 200)}`);
  }
  const rows: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    let values: unknown[];
    try {
      values = JSON.parse(line) as unknown[];
    } catch {
      continue;
    }
    if (!Array.isArray(values)) continue;
    const row: Record<string, unknown> = {};
    header.forEach((col, i) => (row[col] = values[i]));
    rows.push(row);
  }
  return rows;
}

// Factory: picks cloud vs local-Docker from env. Both are REAL federation (D4).
export function makeZetarisClient(): ZetarisClient {
  const base = process.env.ZETARIS_BASE ?? "http://localhost:3000";
  return new ZetarisRestClient({
    base,
    apiKey: process.env.ZETARIS_API_KEY || undefined,
    orgId: process.env.ZETARIS_ORG_ID ?? "1",
    user: process.env.ZETARIS_USER ?? "admin@zetaris.com",
    password: process.env.ZETARIS_PASSWORD ?? "Zetaris1@",
  });
}
