# Architecture Decision Records, COLDSPOT

## ADR-001: Single Next.js full-stack app (A1)
- Context: solo 6-day build; UI + agent loop + Zetaris client + Nemotron calls all needed.
- Decision: one Next.js 15 App Router app; UI + server Route Handlers host everything, TypeScript end to end.
- Rejected: separate frontend + Python/Node backend, declined because two deploys and a cross-language boundary cost solo build time the hackathon window does not have.
- Consequence: one repo, one deploy, shared types; server-only code must set `runtime="nodejs"` for fs/db.
- Where: ARCHITECTURE.md §1/§2; `src/app/**`.

## ADR-002: Oracle Autonomous Database on OCI (A2)
- Context: SQL source TYPE 1 + durable store needed; judge Hay is a data-infra veteran.
- Decision: real Oracle ADB for policy SQL + the durable Trust Ledger; host app on an always-on OCI Compute VM.
- Rejected: Postgres (the pre-ADDENDUM D2 choice), declined because Oracle is more legible to the Zetaris CTO and the same SQL TYPE; a free-tier ephemeral host, declined because it spins to zero and would kill the demo during the Oct27→Nov6 judging window (DL dl-1).
- Consequence: ADB wallet + node-oracledb config overhead; durable through judging; $0 on Always-Free tier.
- Where: ARCHITECTURE.md §10; `src/adapters/oracle/db.ts`.

## ADR-003: One Nemotron model for reasoning AND vision (A3)
- Context: zero paid spend constraint; both a 5-stage reasoning loop and a vision beat needed.
- Decision: single `nvidia/nemotron-3.5-super-vl-120b-a12b` on the free NIM tier for both.
- Rejected: separate text + vision models, declined because it doubles rate pressure on the 40 RPM free tier and adds a second integration for no capability gain (super-VL does both).
- Consequence: must bound the loop under 40 RPM with backoff; request an RPM bump Day 1.
- Where: ARCHITECTURE.md §5; `src/adapters/nemotron/client.ts`.

## ADR-004: Full 3-type single governed Zetaris query, Option A (A4)
- Context: the sponsor must be substitution-locked; Hay will see through a stubbed federation.
- Decision: ONE governed query JOINs all 3 source TYPES in Zetaris; the PDF endorsement is extracted to rows then registered as a Zetaris filestore/virtual table so the join + governance stay 100% in Zetaris.
- Rejected: per-source in-app fetches merged in Node, declined because that is not federation and fails the no-mock invariant in front of the Zetaris CTO; mocking the PDF source, declined, extraction ≠ mocking and mocking violates INVARIANT #1.
- Consequence: a bootstrap step registers 3 sources; the app has no join code at all (structural enforcement).
- Where: ARCHITECTURE.md §4; `src/adapters/zetaris/*`.

## ADR-005: Self-authored treaty REST API seeded with real NOAA dates (A5)
- Context: a 3rd source TYPE (API) needed; live feeds add dependency risk.
- Decision: a self-authored treaty REST service seeded with real NOAA CAT event dates, served deterministically.
- Rejected: a live NOAA feed as the federated source, declined because a dead live API during the demo costs Demo-15 + Technical-20 more than the honesty gain buys; the compounding live-dependency + Zetaris-access risk is the over-scope the feasibility review flagged. Live NOAA is a named stretch only.
- Consequence: the demo is deterministic and bulletproof; honesty preserved (dates are real, provenance stated).
- Where: ARCHITECTURE.md §10; `src/app/api/treaty/*`.

## ADR-006: Zetaris REST-primary transport, JDBC fallback (O1, spike-driven)
- Context: the brief assumed an MCP-first connection; the Day-1 spike had to pick the live path.
- Decision: REST-primary (`POST /api/proxy/sql-editor/sqls/run-query`) behind ONE internal interface, JDBC Lightning as fallback.
- Rejected: an MCP client, declined because the spike proved Zetaris has NO MCP server; its "MCP connection" is a coding-assistant onboarding guide, not a JSON-RPC/stdio transport. REST is the verified, live-tested path.
- Consequence: the brief's "MCP first" wording is satisfied by the "pick the live path at spike" clause; the interface stays swappable.
- Where: ARCHITECTURE.md §4; INVARIANTS.md D-6.

## ADR-007: Author a conformant Scout class (O3, spike-driven)
- Context: Scout Intent must route NL intake; it is a load-bearing Meterless engine.
- Decision: author a `Scout` class implementing the documented `decide()/classify()` contract, validated against the repo eval harness.
- Rejected: `import { Scout } from "@meterless/scout"`, declined because the spike proved the scout-intent package is spec-only (no runnable `src/`, unpublished); the import does not resolve.
- Consequence: a small build task writes the classifier; still legitimately Meterless-powered (conformant + eval-green).
- Where: ARCHITECTURE.md §9; `src/adapters/meterless/scout.ts`.

## ADR-008: Separate Nemotron vision-extract from tool-calling reasoning (O5, spike-driven)
- Context: the vision beat and the reasoning loop both use the one model.
- Decision: the vision-extract call is separate from the tool-calling/structured-output reasoning call.
- Rejected: one combined call with tools + vision + structured output, declined because NVIDIA docs do not confirm the combination works; separating de-risks both.
- Consequence: one extra model call per claim with an image; each call is individually verified.
- Where: ARCHITECTURE.md §5/§8; `src/adapters/nemotron/client.ts`.
