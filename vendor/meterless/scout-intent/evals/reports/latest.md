# Scout eval report

_Generated: 2026-10-25T14:15:09.522Z · corpus v1 · 32 examples_

## Verdict: ✅ PASS

## Metrics

| metric | value |
|---|---|
| intent_top1 | 0.941 |
| intent_top3_recall | 1.000 |
| injection_precision | 1.000 |
| injection_recall | 1.000 |
| tool_precision | 0.933 |
| clarification_rate | 0.000 |
| override_frequency | 0.000 |

## Slices

| slice | intent_top1 | injection_precision | n |
|---|---|---|---|
| surface=chat | 0.938 | 1.000 | 31 |
| surface=inbox | 1.000 |, | 1 |
| role=ae | 0.875 | 1.000 | 21 |
| role=csm | 1.000 |, | 1 |
| intent_family=deal | 0.857 |, | 7 |
| intent_family=email | 1.000 |, | 5 |
| intent_family=research | 1.000 |, | 3 |
| intent_family=plan | 1.000 |, | 2 |
| risk_class=low | 0.909 |, | 11 |
| risk_class=medium | 1.000 |, | 2 |
| risk_class=high | 1.000 |, | 2 |

## Notes

- override_frequency = 0.000 by definition of the corpus, not by measurement: no override data in corpus v1. Overrides are user corrections captured in telemetry ("No, I meant…" + intent switch within the same trace) ÷ contracts issued, measure this in production telemetry (docs/telemetry-and-learning.md).