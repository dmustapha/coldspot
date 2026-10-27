# DESIGN_SYSTEM.md, COLDSPOT

> The durable design contract. Every value here is DERIVED from the shipped code -
> `src/app/globals.css` (OKLCH tokens, alpha ladders, keyframes), `tailwind.config.ts`
> (semantic class names), `src/app/layout.tsx` (fonts). Nothing is invented. When this
> doc and the code disagree, the code wins and this doc is wrong, fix the doc.
> Binding integration rules live in `docs/DESIGN-HANDOFF.md`; this is the token/craft record.

---

## Identity

- **World statement:** A forensic case file under a sodium lamp. Evidence warms amber where
  governed sources land a required fact; the one fact the lamp cannot warm is a frost-cold
  cell, named. COLDSPOT is a carrier-side insurance reserving agent that finds the *cold spot*
  (the missing coverage fact) in a fragmented data field.
- **Accent color + rationale:** investigation amber `oklch(78% 0.145 75)`, sodium-lamp heat,
  the investigator's light. It is the ONE chrome hue: every CTA, focus ring, active state, and
  "found evidence" cell. Chosen against a cold slate ground (hue ~235) so the two temperatures -
  amber *heat* vs ice *absence*, read as opposite poles of one instrument.
- **Named signature element:** the **COLD-SPOT SWEEP** (`src/components/cold/Sweep.tsx`), a
  scanner with a latch: a lattice of the claim's required facts, a beam that sweeps it, cells
  igniting amber where a governed source landed the fact, ONE frost-ringed cell the beam cannot
  warm, and a decision gate below that visibly refuses to latch while any cell is cold.
  Rendered at every scale: `ColdspotMark` (glyph/logo), `MiniLattice` (queue rows), `SweepEngine`
  (hero + demo full field).
- **Invariant phrase:** **"The one fact the lamp cannot warm."** The cold spot is the hero, not
  the verdict. Reuse this line verbatim across README, demo script, and docs.

---

## Tokens

All color tokens are OKLCH `:root` custom properties in `globals.css`; Tailwind maps semantic
class names onto them (`tailwind.config.ts`). One accent hue, surface variety is lightness-step,
depth variety is the alpha-over-role ladder (`color-mix` in oklab), never a second hue.

### Color, base roles
| Token | OKLCH | Role |
|-------|-------|------|
| `--void` | `16% 0.012 235` | page ground (cold slate near-black) |
| `--surface-1` | `19.5% 0.014 235` | nav / flat card / elevation 1 |
| `--surface-2` | `22.5% 0.016 235` | card top-stop / elevation 2 |
| `--surface-3` | `26% 0.018 235` | elevation 3 (highest in-flow surface) |
| `--ink` | `94% 0.008 220` | primary text |
| `--ink-dim` | `72% 0.01 225` | secondary text |
| `--ink-faint` | `56% 0.012 230` | tertiary text / labels |

### Color, the one chrome accent (amber)
| Token | OKLCH | Role |
|-------|-------|------|
| `--accent` | `78% 0.145 75` | THE chrome hue: CTAs, focus, active, warm-cell fill |
| `--accent-hi` | `87% 0.12 80` | hover / high state, focus ring (`--focus-ring`) |
| `--accent-deep` | `55% 0.12 65` | active / pressed, gate gradient floor |

### Color, data-only semantics (NEVER chrome)
| Token | OKLCH | Meaning (greppable law) |
|-------|-------|------|
| `--ice` | `87% 0.055 215` | **a required fact is MISSING**, cold cells, ABSTAIN. Scarcity is the point. |
| `--ice-deep` | `64% 0.07 220` | ice at depth |
| `--jade` | `74% 0.13 165` | reserve / verified / complete |
| `--garnet` | `64% 0.19 20` | deny / mismatch / contradiction / error |

### Alpha-over-role ladder (`color-mix(in oklab, <role> N%, transparent)`)
Depth comes from opacity, not new hues. Rungs shipped:
- `--ink-04 / -06 / -08 / -12 / -18 / -30 / -45 / -70`
- `--accent-08 / -12 / -18 / -30 / -50`
- `--ice-10 / -16 / -28 / -45`
- `--jade-12 / -25`, `--garnet-12 / -25`

Semantic aliases: `--border = ink-08`, `--border-strong = ink-18`, `--hover-fill = ink-06`,
`--focus-ring = accent-hi`.

### Type scale
Fonts loaded in `layout.tsx` via `next/font/google`:
- **display**, Schibsted Grotesk (500/700/800), `--font-display`. `-0.03em`, line-height `1.0`.
- **body**, Public Sans (400/500/600), `--font-body`. 15px / 1.6 (the regulatory-document face).
- **mono**, Spline Sans Mono (400/500/600), `--font-mono`. Eyebrow 11px / `+0.22em` uppercase;
  numerals lining + tabular.

Named type roles (`@layer components` in `globals.css`): `.display`, `.eyebrow` (amber),
`.eyebrow-ice` (ice), `.numeral` (display-face, lining+tabular, units at `0.54em` via `.unit`),
`.mono-data`.

### Spacing
Tailwind default 4px base unit (no custom spacing scale shipped). Card padding `p-3.5`,
nav height `52px`, content max-width `max-w-6xl`.

### Border-radius scale (tokenized, no ad-hoc values in chrome)
| Token | Value | Use |
|-------|-------|-----|
| `rounded-card` | `12px` | cards, panels |
| `rounded-chip` | `6px` | chips, buttons, nav items |
| pill | `999px` | gate track, dots |
Signature-internal geometry uses literal radii by design (lattice cell `8px`, frost ring `11px`,
bolt `3px`), these are *drawing coordinates of the signature object*, documented in the Craft
section, not chrome radii.

### Shadow scale, philosophy: **pure-glow** (colored light only, never neutral drops in flow)
| Token | Value | Use |
|-------|-------|-----|
| `--shadow-overlay` | `0 24px 64px -16px rgba(2,6,14,0.65)` | the ONLY neutral shadow, overlays/modals only |
| `--glow-lamp` | `0 0 120px -20px var(--accent-30)` | the landing lamp radial |
| `--glow-cell` | `0 0 14px 2px var(--accent-30)` | per-cell evidence heat |

### Ready-to-paste `@theme` block (dark-only, register-ruled)
```css
/* COLDSPOT tokens, dark-only. Paste into :root (Tailwind v3 maps via tailwind.config.ts). */
:root {
  --void: oklch(16% 0.012 235);
  --surface-1: oklch(19.5% 0.014 235);
  --surface-2: oklch(22.5% 0.016 235);
  --surface-3: oklch(26% 0.018 235);
  --ink: oklch(94% 0.008 220);
  --ink-dim: oklch(72% 0.01 225);
  --ink-faint: oklch(56% 0.012 230);
  --accent: oklch(78% 0.145 75);        /* THE chrome hue */
  --accent-hi: oklch(87% 0.12 80);
  --accent-deep: oklch(55% 0.12 65);
  --ice: oklch(87% 0.055 215);          /* DATA-ONLY: missing fact */
  --ice-deep: oklch(64% 0.07 220);
  --jade: oklch(74% 0.13 165);          /* DATA-ONLY: reserve/verified */
  --garnet: oklch(64% 0.19 20);         /* DATA-ONLY: deny/mismatch */
  /* alpha ladder: color-mix(in oklab, <role> N%, transparent) at 04/06/08/12/18/30/45/70 */
  --border: color-mix(in oklab, var(--ink) 8%, transparent);
  --border-strong: color-mix(in oklab, var(--ink) 18%, transparent);
  --hover-fill: color-mix(in oklab, var(--ink) 6%, transparent);
  --focus-ring: var(--accent-hi);
  --shadow-overlay: 0 24px 64px -16px rgba(2, 6, 14, 0.65);
  --glow-lamp: 0 0 120px -20px color-mix(in oklab, var(--accent) 30%, transparent);
  --glow-cell: 0 0 14px 2px color-mix(in oklab, var(--accent) 30%, transparent);
  --radius-card: 12px;
  --radius-chip: 6px;
}
/* fonts: display Schibsted Grotesk · body Public Sans · mono Spline Sans Mono */
```

### Do's / Don'ts
**Do**
- Use exactly ONE chrome hue (amber). Surface variety = lightness-step; depth variety = the alpha ladder.
- Elevate with `bg-step + 1px hairline`; glows are colored only.
- Reserve `--ice` for the single meaning "a required fact is missing."

**Don't**
- Never use `--ice`, `--jade`, or `--garnet` as decoration or chrome, they are data/verdict only.
- Never ship `backdrop-filter`/glassmorphism, a neutral drop shadow in flow, or an em-dash in a string.
- Never introduce an ad-hoc `rounded-[17px]` or inline hex in chrome, use the tokens.

---

## Status Legend

Color carries meaning, never decoration. Each maps to a product state / verdict token.
| Color | Token | State meaning |
|-------|-------|----------------|
| Amber `--accent` | `warm` cell / INVESTIGATING | a governed source landed this required fact; or the agent is sweeping |
| Ice `--ice` | `cold` cell / `abstain` | a required fact is MISSING, the gate is held open and the fact is named |
| Jade `--jade` | `reserve` | all facts resolved, gate latched, reserve issued |
| Garnet `--garnet` | `deny` / `contradiction` | a governed source contradicts coverage; gate latched deny |
| Ink hairline `--ink-18` | `pending` | not yet investigated: hollow hairline cells, no fill, NEVER ice |

---

## Craft

- **Radius scale (CF-1):** chrome radii tokenized, `rounded-card` (12), `rounded-chip` (6),
  pill (999). Signature-internal radii (lattice cell 8, frost ring 11, bolt 3) are the
  drawing coordinates of the COLD-SPOT SWEEP object and are intentional, documented literals.
- **Elevation ladder (CF-2):** dark-mode surfaces get lighter per z-level -
  `void (16%) → surface-1 (19.5%) → surface-2 (22.5%) → surface-3 (26%)`, each paired with a
  1px hairline at `ink-08` (or `ink-18` for strong). `.card` is a `180deg` gradient from
  `surface-2 → surface-1`; `.card-flat` is flat `surface-1`.
- **Shadow philosophy, pure-glow (named):** no neutral drop shadow ever sits in flow. The only
  neutral shadow is `--shadow-overlay` on true overlays. All in-flow "elevation glow" is colored
  lamp heat: `--glow-lamp` (landing radial), `--glow-cell` (warm evidence cell).
- **Glass recipe:** NONE. `backdrop-filter` is banned (DESIGN-HANDOFF §2). The nav is opaque
  `bg-surface-1` + `border-b border-ink-08`.
- **Hover recipe:** chrome hover shifts color/fill, never adds a drop shadow. Nav items:
  `hover:text-ink`; CTA: `hover:bg-accent-hi`; rows/controls: `hover-fill = ink-06`.
- **Active recipe:** `active:bg-ink-08` (nav), `active:bg-accent-deep` (CTA).
- **Focus-visible recipe:** global, `:focus-visible { outline: 2px solid var(--focus-ring);
  outline-offset: 2px; }` where `--focus-ring = --accent-hi`. One ring, everywhere.
- **Named signature element + where it stays visible:** the COLD-SPOT SWEEP, logo glyph
  (`ColdspotMark`, nav), favicon (`src/app/icon.svg`), hero + demo (`SweepEngine`), every queue
  row (`MiniLattice`), portfolio book-field, `/proof` eyebrow strip, the full-bleed closer that
  snags on the cold cell.

### Logo assets (the identity, formalized)
All are token-exact OKLCH vector. The one law across every mark: **no amber may land inside the
cold cell** (the lamp cannot warm it); the amber sweep-node rides the beam over a warm region.
| Asset | File | Use | Reduction |
|-------|------|-----|-----------|
| Primary mark | `public/logo.svg` (+ `logo.png` 512) | README, app icon, large | full: lattice + frost ring + beam + warm sweep-node |
| Horizontal lockup | `public/logo-lockup.svg` | nav/header, docs | mark + Schibsted Grotesk 800 wordmark |
| Favicon | `src/app/icon.svg` (+ `public/favicon.ico` 16/32/48) | browser tab | beam + frost ring DROPPED (muddy <16px); lattice + dashed-ice cold cell kept |
| Social card | `public/og.svg` (+ `og.png` 1200x630) | OG / Twitter (metadata points at the `.png` so scrapers rasterize) | full composition + wordmark + ABSTAIN chip |
Cold-cell near-black: the live `ColdspotMark` component uses the `--void` token (16%); the fixed
static assets use a slightly deeper `oklch(13% 0.014 230)` so the frost ring reads at small sizes.
Both resolve as "void"; the 3% deepen is an intentional static-asset choice, not drift.

---

## Primitives

Component-layer primitives (CSS utilities in `globals.css @layer components`, components in
`src/components/cold/Chrome.tsx` + `Sweep.tsx`):

- **Card**, `.card` (gradient surface-2→surface-1 + hairline, r12) · `.card-flat` (flat surface-1).
- **Button / CTA**, amber: `bg-accent text-[oklch(18%_0.02_75)] rounded-chip px-3.5 py-1.5
  font-semibold hover:bg-accent-hi active:bg-accent-deep`. Ghost / secondary: plain text + hairline.
- **Nav item**, `rounded-chip px-3 py-1.5 text-[13px] hover:text-ink active:bg-ink-08`;
  active = `bg-ink-06 text-ink`.
- **Chip, verdict** (`VerdictChip`): hue + SHAPE pair, identical everywhere. reserve=jade dot,
  deny=garnet square, abstain=dashed-ice square, pending=hollow ink ring.
- **Chip, provenance** (`ProvChip`): names where a number came from; `degraded` = dashed ink hairline.
- **Stat** (`Stat`): `.card-flat` + mono uppercase label + `.numeral` display value with `.unit`.
- **Hairline**, `.hairline` (ink-08), `.hairline-strong` (ink-18).
- **Textures**, `.survey-ruling` (masked 56px grid, landing only), `.case-stamp` (outlined
  display watermark), `.eyebrow` / `.eyebrow-ice` (mono uppercase labels).

---

## Motion

Named keyframes in `globals.css` (all killed by the global `prefers-reduced-motion: reduce`
block, no JS-driven loop may escape it). Frame-0 law: the current state is in the markup
synchronously; CSS only *reveals* (arrival is a deblur, never a rolling number).

| Keyframe | Duration / ease | Role |
|----------|-----------------|------|
| `rise-in` | `--t-reveal` (800ms) `out-quart`, both | section reveal (rise + deblur from 0.35) |
| `row-in` | 520ms `out-quart` | staggered row arrival |
| `value-arrive` | 700ms `out-quart` | final value deblur |
| `lamp-breathe` | ~slow loop | landing lamp radial (the one living atmosphere) |
| `cell-smoulder` | 3.2s loop | warm evidence-cell heat |
| `frost-pulse` | 2.8s loop | cold-spot frost ring |
| `beam-sweep` | 6.5s alternate | the sweep beam traverse (`--beam-travel`) |
| `latch-close` | 600ms `back` @1.45s | decision gate latching (38% → 49.25%) |
| `bolt-seal` / `bolt-jam` | 700 / 900ms `back` @1.45s | bolt seals the seam, or jams at the cold gap lip |
| `closer-beam` | full-bleed loop | closer beam advance → recoil → retry → pass (snags the cold cell) |
| `scope-flash` | one-shot | scoped live re-render flash (one cell, never a grid) |

- **Default transition:** `--t-fast 150ms`, `--t-med 400ms`, `--t-reveal 800ms`.
- **Eases:** `--ease-out-expo (0.16,1,0.3,1)`, `--ease-out-quart (0.22,1,0.36,1)`,
  `--ease-back (0.34,1.56,0.64,1)`.
- **Money-moment stagger:** cells ignite `150 + i·110ms`; latch/bolt resolve at 1.45–2.0s; then
  calm loops (beam, frost, smoulder).
