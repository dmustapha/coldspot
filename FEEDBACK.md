# Feedback

A running, judges-facing Q&A. Each thread is a question, the answer, and the change it produced. Open an issue or a discussion with a question and it will be answered here.

## Q: Is the data real?
The hard parts are real: Zetaris federation, Nemotron reasoning and vision, live OpenFEMA catastrophe windows, and the Meterless engines. The carrier policy records are representative-seeded because real carrier policy and claims systems are not publicly accessible. The seed stands in for those systems; everything the agent does over that data is real. Full detail in `CLAIMS.md`.

## Q: How do I know the federation is not an in-app join?
The Zetaris client exposes only `runFederatedQuery(sql)`. There is no fetch-and-merge path in the codebase. The join runs in Zetaris. See `src/adapters/zetaris/` and the C3 discovery eval.

## Q: Can the model override the verdict?
No. A deterministic `isComplete` gate decides reserve or abstain. The model gathers facts and explains the decision, but the gate is the source of truth. Identical inputs produce identical verdicts (proven in the evals).

## Q: How do I know the vision is reading the document, not hallucinating a convenient date?
Because it refuses to answer when the image does not contain the fact. Upload the real FEMA declaration and Nemotron-VL extracts the actual window (2026-09-10 to 2026-09-18). Upload an unrelated image (we tested a random photo) and it returns no window with confidence 0, so the completeness gate stays open and the claim stays abstained. The reserve only moves when a real document supplies the fact. The extraction path is `src/adapters/nemotron/vision-facts.ts` (`extractCatWindow`).

## Q: Why abstain instead of giving your best guess?
A wrong reserve is worse than no reserve: it either over-reserves (locks up capital) or under-reserves (regulatory and solvency risk). COLDSPOT names the one missing fact and the source that resolves it, so a human closes a known gap instead of auditing a plausible-looking number. Abstention is the product, not a failure mode.
