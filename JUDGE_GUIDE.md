# Judge Guide: the first 60 seconds

1. **Open https://coldspot-agent.duckdns.org/demo** (10s). This is the recorded hero run, pinned so it plays instantly (a live resolve is 13 to 40 seconds by nature; the replay shows the earned trace without the wait).
2. **Watch the Trust Ledger stream** (20s): probe, discard the stale decoy (with its signal-derived reason), federate three sources through one governed query, reconcile, and hit the cold spot. The agent abstains and names the missing fact instead of guessing.
3. **See the flip** (10s): vision reads the FEMA declaration, supplies the catastrophe window, and the deterministic gate turns the abstain into a reserve of $750,000 with the cession math.
4. **Click a decision sentence** on `/app/claim/CLM-4471` (10s): the evidence graph lights up its provenance chain (sentence to source fact to ledger step). Nothing is a claim without a trace.
5. **Open /portfolio** (10s): the book view across 9 claims, $2.73M reserved, with systemic cold-spot clusters (claims stuck on the same missing fact). Press "re-derive from live sources" to watch a decision recompute identically.

## What is real vs representative
Carrier policy data is representative-seeded (real carrier systems are not publicly accessible). The federation (Zetaris), reasoning and vision (Nemotron), live catastrophe data (OpenFEMA), and the Meterless engines are all real. See `CLAIMS.md`.

## Reproduce the numbers
`npm test` (offline, keyless), `npm run evals` (live gates), `npm run conformance` (Meterless H-MEM 13/13, Scout PASS).
