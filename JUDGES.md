# For Judges

**Thesis:** COLDSPOT is a carrier-side insurance reserving agent that federates fragmented data through one governed query and refuses to guess: it abstains on the one missing coverage fact, then vision reads the document that closes the gap and turns the abstain into an auditable reserve.

## The one thing to see
Open the recorded money beat (instant, no waiting):
**https://coldspot-agent.duckdns.org/demo**

Watch the agent discover sources, discard a stale one, federate three live systems through one Zetaris query, hit the cold spot (a missing catastrophe window), abstain naming the exact fact, then read the FEMA declaration with Nemotron vision and flip to a reserve with full lineage.

## The one command to trust it
```bash
git clone https://github.com/dmustapha/coldspot.git && cd coldspot && npm ci && npm test
```
53 tests, keyless and offline, cover the engine-as-truth gate, the reconcile logic, the evidence graph, and the World Model.

## Live surfaces
- App console: https://coldspot-agent.duckdns.org/app
- Portfolio (book view): https://coldspot-agent.duckdns.org/portfolio
- Proof surface: https://coldspot-agent.duckdns.org/proof

## Tracks
Track 01 Solving Fragmented Intelligence (primary), Track 03 Reasoning Architecture, NVIDIA Nemotron special prize.

Questions and answers are in `FEEDBACK.md`. A deeper walkthrough is in `JUDGE_GUIDE.md`.
