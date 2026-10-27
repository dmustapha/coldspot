# Limitations, COLDSPOT

## In scope (built for this submission)
- Real Zetaris federation across 3 source TYPES (Oracle SQL + endorsement rows as a virtual/filestore table + treaty REST API) in ONE governed query.
- Nemotron 5-stage reasoning loop (plan→probe→gather→reconcile→decide/abstain) via function-calling + structured output, rendered live as the UI.
- Real probe-driven source discovery with discard-on-screen reasons derived from live schema/freshness/coverage signals.
- Abstention that names the specific missing fact + the source that resolves it.
- Bounded Nemotron-VL vision beat (extract damage type/date/amount from one uploaded image, cross-check vs policy/claim/CAT window).
- Meterless H-MEM Trust Ledger (append-only, replayable, mirrored to Oracle ADB) + Scout Intent NL routing.
- Durable hosted demo on OCI (always-on VM + ADB) sized to the Oct 27→Nov 6 judging window.

## Feature-gated (deliberately not built for this scope)
- **CAT-event stream as a live 4th federated source.** Reason: scope, 3 TYPES is the MVP; the stream is a named stretch, never faked.
- **Live NOAA as a federated source.** Reason: demo safety, a dead live API during judging costs more than the honesty gain; NOAA dates are real but served deterministically via the treaty API.
- **Fraud / authenticity forensics on claimant images.** Reason: scope + safety, the vision beat is bounded extract + consistency-check only.
- **Production actuarial accuracy / correct reserve amounts.** Reason: scope, COLDSPOT is decision-support; reserves are illustrative.
- **Multi-tenant isolation, authentication/authorization, real PII handling.** Reason: scope, single-tenant demo over a seeded estate; no login wall.
- **Unseen-5th-source live handling.** Reason: scope, discovery is proven over a seeded catalog (incl. a decoy); handling a brand-new source live is a flourish, not a correctness dependency.
- **Wildcard track submission.** Reason: single-track max-depth locked (Track 01 + Nemotron special only).
