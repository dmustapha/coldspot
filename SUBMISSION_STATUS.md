# Submission status
_Last updated: forge (planning). Build keeps this current as features land._

## Status
- [ ] Zetaris dual access resolved (cloud creds OR local Docker), day-1 build
- [ ] 3-type federation registered; ONE governed query returns rows
- [ ] Source probes produce real discard reasons (decoy discarded)
- [ ] Nemotron 5-stage loop decides reserve OR abstains with named fact
- [ ] Scout Intent class authored + eval-harness green
- [ ] H-MEM Trust Ledger append-only + Oracle-mirrored + replay UI
- [ ] Nemotron-VL vision beat (separate call) feeds the decision
- [ ] Oracle ADB provisioned; seed estate loaded; hero claim pre-run
- [ ] Landing `/` + `/app` + `/app/claim/[id]` + `/demo` + `/proof` routes
- [ ] Durable OCI deploy survives through Nov 6
- [ ] `submission/proof.md` captured (federated SQL transcript, Nemotron trace, ledger JSONL, Scout eval)
- [ ] ≤3-min demo video + README rubric map + per-sponsor usage

## Known limitations / blockers
- Zetaris live access unresolved until Day-1 probe (dual path mitigates). Reason: blocked-on external creds.
- Scout Intent requires authoring (package spec-only). Reason: upstream, no runnable src.
- Nemotron tools+vision-in-one-call unverified. Reason: time/safety, separated per ADR-008.
- CAT-stream 4th source, live NOAA, fraud forensics, actuarial accuracy, auth/multi-tenant deliberately out. Reason: scope (see LIMITATIONS.md).
