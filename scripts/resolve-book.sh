#!/usr/bin/env bash
# Resolve every seeded claim so the book has real verdicts (idempotent; appends to the ledger).
# The hero CLM-4471 is resolved WITHOUT a FEMA report so it rests in its canonical abstain state.
# Run AFTER `tsx scripts/seed-demo.ts`, with the dev server on :3100.
# NOTE: never run `hero:prerun` against a populated book without KEEP_LEDGER=1 — it archives the ledger.
set -u
BASE="${APP_URL:-http://localhost:3100}"
CLAIMS=(CLM-4471 CLM-7781 CLM-9002 CLM-4480 CLM-4495 CLM-5126 CLM-3310 CLM-2207)
for c in "${CLAIMS[@]}"; do
  code=$(curl -s --max-time 120 -X POST "$BASE/api/claim/resolve" -H 'content-type: application/json' -d "{\"claimId\":\"$c\"}" -o /dev/null -w "%{http_code}")
  echo "$c -> HTTP $code"
done
echo "book resolved — verify: curl -s $BASE/api/portfolio | jq .book"
