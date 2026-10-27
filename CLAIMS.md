# CLAIMS, COLDSPOT headline numbers (recompute, never read-back)

Every headline number COLDSPOT states is recomputable from committed seed data by
`scripts/verify-claims.ts` (filled in P4.2). The verifier re-derives each value from
source, it refuses to read a number back from a cached artifact.

| Claim | Value | Recompute source | Verified by |
|-------|-------|------------------|-------------|
| Global P&C insurance premium base | ~$900B | cited external market figure (context only; not a COLDSPOT output) | `scripts/verify-claims.ts` |
| Annual underwriting leakage from fragmented coverage data | ~$30B | cited external market figure (context only; not a COLDSPOT output) | `scripts/verify-claims.ts` |
| Hero claim CLM-4471 outcome | ABSTAIN, missing "whether the loss date falls inside the declared CAT event window" | one governed Zetaris JOIN (1 row) + reconcile completeness gate | `scripts/verify-claims.ts` |
| Sources discovered vs discarded (decoy) | 3 relevant, 1 discarded (legacy_notes) | live source probes over the 4-source catalog | `scripts/verify-claims.ts` |

Recomputed + PASS (P4.2). Reproduce:
`set -a && . ./.env.local && set +a && npx tsx scripts/verify-claims.ts` ->
`VERIFY_CLAIMS: PASS` (requires the Zetaris stack up + treaty API on :3100).
The decoy discard reason is signal-derived at runtime, e.g.
`"stale (last refreshed 2019-03-01, 2792d > 365d); 0 rows match policy POL-1001"`.
