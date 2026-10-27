# DESIGN-HANDOFF.md, the COLDSPOT identity, for whoever wires or extends the UI
[2026-10-25. Written by the design cycle for the main build chat. This is the integration
contract: read this before touching any surface. Full design record (calibration, selection,
audience contract, scorecard, adversarial log) lives OUTSIDE this repo at
`/Users/MAC/pipeline-audit/skill-audit/win-audit/REFERENCE-TEARDOWN/RUN-coldspot/`.]

## 0. PATH HIERARCHY (binding, owner ruling)
**The console is the product. The replay is a demo path.**
- PRIMARY user path: `/app` (claim queue) → `/app/claim/[id]` (resolution surface) →
  `/portfolio` (book view). This is what every loudest affordance points at: the nav's one
  amber CTA is "Open the console"; the landing hero's primary CTA and the closer's primary
  CTA both go to `/app`.
- SECONDARY paths: `/demo` is the JUDGE REPLAY of the recorded hero abstain run (pinned by
  `run="latest-abstain"`, labeled on-surface) and `/proof` is the artifact/verification
  surface. They get nav items and ghost buttons, never the amber slot.
- When adding any new CTA, banner, or nav item: the amber primary slot belongs to the
  console path. A replay/demo affordance is always a ghost button or plain nav item.

## 1. Source of truth
- Tokens + motion: `src/app/globals.css` (OKLCH vars, alpha ladders, keyframes,
  reduced-motion) + `tailwind.config.ts` (semantic class names). Fonts: `src/app/layout.tsx`
  (Schibsted Grotesk display / Public Sans body / Spline Sans Mono).
- Shared chrome: `src/components/cold/Chrome.tsx`, `SiteNav` (opaque + hairline, NO glass),
  `VerdictChip`, `ProvChip`, `Stat`.
- THE SIGNATURE: `src/components/cold/Sweep.tsx`, `SweepEngine` (lattice + beam + gate +
  bolt), `MiniLattice` (row-scale), `ColdspotMark` (logo). Live-derived wrapper:
  `src/components/ClaimThermogram.tsx` (fetches the ledger, derives cells from the reconcile
  `facts` object; accepts `run="latest" | "latest-abstain"`).

## 2. Color law (greppable, non-negotiable)
- ONE chrome accent: amber (`--accent`). All CTAs, focus, active chrome.
- `--ice` is DATA-ONLY and means exactly "a required fact is missing": cold cells, ABSTAIN
  chips/stamps, cold-spot clusters. Never decoration, never headlines that don't name a gap.
- `--jade` = reserve/verified, `--garnet` = deny/mismatch/error, data and verdict chrome
  only. Hollow `ink-18` cells = not-yet-investigated (never ice).
- No glassmorphism (`backdrop-filter` is banned), no neutral drop shadows in flow, 1px
  hairlines at `ink-08/18` only, no em-dashes in any shipped string.

## 3. Wiring rules for new or changed surfaces
1. **Fetch the fold, never hardcode.** Any number that claims reality either comes from
   `/api/portfolio` + `/api/claims` (merged, unswept claims must never vanish from counts;
   see `PortfolioDashboard`/`ClaimQueue` for the merge pattern) or is explicitly labeled as
   the recorded run it quotes. The append-only ledger grows; literals rot within hours.
2. **Pin narrated runs.** Any surface that tells a specific run's story passes a run
   selector (`latest-abstain` for the hero abstain beat) to `ClaimThermogram`,
   `TrustLedgerTimeline`, and `EvidenceGraph`, never rely on "latest".
3. **Provenance chips on claims of reality** (`ProvChip`): where a number came from, or a
   degraded state saying it is unreachable. A designed degraded/empty state is required for
   every fetch (copy the patterns in `ClaimQueue` / `LandingBookStats`).
4. **States per interactive class:** hover + focus-visible (global ring) + `active:` +
   real `disabled` attributes. Loading = `card-flat animate-pulse` + `aria-busy`; errors =
   `role="alert"` garnet card. No `aria-live` on loops.
5. **Motion:** use the named keyframes (`rise-in`, `row-in`, `value-arrive`, `frost-pulse`,
   `cell-smoulder`, `beam-sweep`, `latch-close`, `bolt-seal/jam`, `closer-beam`); final
   values render synchronously (arrival is a deblur, never a rolling number); everything is
   killed by the global reduced-motion block, do not add JS-driven loops that escape it.
6. **Voices:** display face for headlines + hero numerals (units at 0.54em via
   `.numeral`/`.unit`); mono (`.mono-data`, `.eyebrow`) for ids, citations, small numerics,
   24h timestamps; body for prose. Ledger-style constructions over stat grids (R8).

## 4. What exists per surface (don't regress these)
- `/` landing: survey-ruling + lamp radial ground, hero engine on the committed abstain run
  (labeled "replayed from the ledger"), live `LandingBookStats` metered ledger, case-stamp
  watermarks, full-bleed closer sweep that snags on the cold cell.
- `/app`: status strip + filter chips + dense rows (verdict chip, mini-lattice, money,
  sources kept/refused, FEMA provenance, verified, named cold spot) + evidence rail, ALL
  from one merged fetch so the strip can never contradict the rows.
- `/app/claim/[id]`: live thermogram (latest run) → intake → branded upload drop-targets →
  streamed reasoning (shared busy gate across both resolve controls) → source tiles →
  decision panel → recompute diff → designed ledger timeline (hero-line + raw-entry
  disclosure) → evidence graph with drawn lineage edges and collapsed uncited steps.
- `/demo`: the pinned abstain replay + causality-flip footnote linking `/proof`.
- `/portfolio`: book-as-lattice-field instrument band (merged counts), ice cluster band
  ($0 clusters explain themselves), per-claim table.
- `/proof`: artifact cards whose values are READ FROM `evidence/*.json` at render
  (`force-dynamic`), ledger entry count, missing-artifact and FAIL states designed.

## 5. Known gaps the next builder should know
Dark-only (register-ruled) · seeded estate is 5 claims (contract wants ≥8 queue rows; needs
seed data, not layout) · source counts are cumulative across runs (per-run counts need an
API change) · landing hero cells are authored from the committed abstain run (labeled), not
fetched.
