# Vendored Meterless engines (Apache-2.0)

This directory vendors the **real** Meterless open-source engines from
`github.com/meterless/meterless` (Apache-2.0, see `LICENSE`) so COLDSPOT's Meterless integration is
**independently verifiable** rather than claimed. These are the engines' OWN specs, conformance
suites, and eval harnesses, COLDSPOT does not grade itself.

## What's here

- `hmem/`, the Meterless **H-MEM** engine spec + reference implementation + conformance suite
  (`hmem/conformance/runner.ts`, 13 falsifiable spec vectors: record validation, feedback deltas,
  ranking order, sleep guardrails, conflict gate, ledger audit, dream boundary).
- `scout-intent/`, the Meterless **Scout** engine spec + eval harness
  (`scout-intent/evals/runner/index.ts`, v1 regression corpus + `config/thresholds.yaml` release gate).
  COLDSPOT's spec-compatible Scout implementation lives in `scout-intent/impl/index.ts` (registry-driven
  intent classification + adversarial-tight injection policy; it reads the engine's own fixture registry
  and is scored by the engine's own harness, never hardcoded to the labels).

## Verify (one command, from `coldspot/`)

```bash
npm run conformance
```

Runs both engine suites and exits non-zero unless BOTH pass:

- **H-MEM conformance:** `13/13 checks passed`, exit 0.
- **Scout eval:** gate PASS, intent_top1 0.941 (floor 0.85), intent_top3_recall 1.000,
  injection_precision 1.000, injection_recall 1.000 (floor 0.82), tool_precision 0.933 (floor 0.80).

Individually: `npm run conformance:hmem`.

## Honest scope

COLDSPOT's *production* Trust Ledger (`src/adapters/meterless/trust-ledger.ts`) and app Scout
(`src/adapters/meterless/scout.ts`) are narrow, domain-specific adapters built for the claims pipeline.
The engines here are the FULL published Meterless contract; `scout-intent/impl/index.ts` is a genuine
spec-compatible Scout that passes the published eval gate. The verifiable sponsor claim is therefore:
**COLDSPOT ships the Meterless H-MEM and Scout engines and passes their published conformance/eval
suites (exit 0).** The reference H-MEM is the vendored reference implementation; no result is faked.

Trimmed from the upstream repo: images, workshops, marketing content, and demos (not needed to run the
suites). The engine source, conformance vectors, eval corpus, and thresholds are intact and unmodified.
