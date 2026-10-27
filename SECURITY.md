# SECURITY, COLDSPOT

## Threat matrix

| Threat | Enforcement | File |
|--------|-------------|------|
| Injection into Lightning SQL | Parameterize/escape claim inputs; validate `policyId`/`claimId` format before building the governed SQL | `src/adapters/zetaris/lightning-sql.ts` |
| Oversized / malicious image upload | Size + MIME validation before the vision call | `src/components/VisionUpload.tsx` + `src/app/api/claim/resolve/route.ts` |
| Credential leakage | All secrets server-side env only; never in the client bundle; route handlers run `runtime = "nodejs"` | `.env`, route handlers |
| Fabricated decision / mock federation | Fail-closed to BLOCKED/abstain; no mock federation path exists in code | `src/core/orchestrator.ts`, `src/core/decision-schema.ts` |

## Not defended against

COLDSPOT is a single-tenant hackathon demo. It deliberately does NOT defend:

- **Multi-tenant isolation**, single-tenant demo; no per-org data partitioning.
- **Real PII handling**, seed data is synthetic; no PII processing/retention controls.
- **Authentication / authorization**, no login; any caller can resolve any seeded claim.
- **Production SQL-injection hardening**, input validation only, not a full WAF/parameter-binding audit.
- **DoS / rate-abuse of the public demo**, no rate limiting on the public endpoints.
