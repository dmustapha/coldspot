// File: src/components/cold/Sweep.tsx
// THE SIGNATURE — the COLD-SPOT SWEEP. A scanner mechanism, not a styled chart:
// a lattice of the claim's REQUIRED FACTS, a beam that sweeps it, cells igniting
// lamp-amber where a governed source landed the fact, ONE frost-ringed cell the
// beam cannot warm, and a decision gate below that visibly refuses to latch
// while any cell is cold. Encodes every product state:
//   INVESTIGATING = beam running, cells igniting
//   RESERVE/APPROVE = all warm, gate latched jade
//   DENY = warm + garnet contradiction, gate latched garnet
//   ABSTAIN = cold cell + the gate held open + the missing fact named in ice
// Frame-0: the current state is in the markup synchronously; CSS only reveals.

import type { ReactNode } from "react";

export type CellState = "warm" | "cold" | "contradiction";
export interface FactCell {
  id: string;
  label: string;
  state: CellState;
}
export type Verdict = "reserve" | "abstain" | "deny" | "pending";

/* ---------------------------------------------------------------- lattice */

function Cell({
  cell,
  index,
  animateIn,
}: {
  cell: FactCell;
  index: number;
  animateIn: boolean;
}) {
  const base =
    "relative flex min-h-[64px] flex-col justify-between rounded-[8px] border p-2.5 transition-colors duration-300";
  const delay = animateIn ? { animationDelay: `${150 + index * 110}ms` } : undefined;

  if (cell.state === "cold") {
    return (
      <div
        className={`${base} border-dashed border-ice-45 bg-[oklch(14%_0.014_230)]`}
        data-cell="cold"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[5px] rounded-[11px] border border-ice-28"
          style={{ animation: "frost-pulse 2.8s ease-in-out infinite" }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ice">
          {cell.label}
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ice">
          cold
        </span>
      </div>
    );
  }
  if (cell.state === "contradiction") {
    return (
      <div className={`${base} border-garnet-25 bg-garnet-12`} data-cell="contradiction">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-garnet">
          {cell.label}
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-garnet">
          conflict
        </span>
      </div>
    );
  }
  return (
    <div
      className={`${base} border-accent-30 bg-accent-12 ${animateIn ? "value-arrive" : ""}`}
      style={{
        ...delay,
        boxShadow: "0 0 14px -2px var(--accent-30)",
      }}
      data-cell="warm"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-hi">
        {cell.label}
      </span>
      <span
        aria-hidden
        className="h-1 w-full rounded-full bg-accent"
        style={{ animation: "cell-smoulder 3.2s ease-in-out infinite" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- gate */

function Gate({
  verdict,
  stamp,
  animateIn,
}: {
  verdict: Verdict;
  stamp: ReactNode;
  animateIn: boolean;
}) {
  const latched = verdict === "reserve" || verdict === "deny";
  const tone =
    verdict === "reserve" ? "var(--jade)" : verdict === "deny" ? "var(--garnet)" : "var(--ice)";
  const halfBase = "absolute top-0 h-full rounded-full";
  // Open gap when the gate refuses: each half stops at 38% leaving a cold void.
  // Latched: both halves seal in the verdict tone, meeting at the center seam.
  const leftW = latched ? "49.25%" : "38%";
  const rightW = latched ? "49.25%" : "38%";
  const leftBg = latched
    ? `linear-gradient(90deg, color-mix(in oklab, ${tone} 55%, var(--void)), ${tone})`
    : "linear-gradient(90deg, var(--accent-deep), var(--accent))";
  const rightBg = latched
    ? `linear-gradient(270deg, color-mix(in oklab, ${tone} 55%, var(--void)), ${tone})`
    : "linear-gradient(270deg, var(--accent-deep), var(--accent))";
  // The latch CLOSES as a keyframe (38% -> 49.25%) so the decide verb is visible
  // at mount; a transition would never fire (widths are set once, never changed).
  const latchAnim =
    latched && animateIn ? "latch-close 600ms var(--ease-back) 1.45s both" : undefined;
  return (
    <div className="mt-4">
      <div className="relative h-[6px] w-full overflow-visible rounded-full bg-ink-06">
        <span
          className={halfBase}
          style={{ left: 0, width: leftW, background: leftBg, animation: latchAnim }}
        />
        <span
          className={halfBase}
          style={{ right: 0, width: rightW, background: rightBg, animation: latchAnim }}
        />
        {/* the BOLT: travels the bar and either seals the seam (latched, verdict
            tone) or jams at the lip of the cold gap (abstain) — the gate has a
            moving part, not just a caption */}
        {latched ? (
          <span
            aria-hidden
            className="absolute top-1/2 h-[12px] w-[12px] -translate-y-1/2 rounded-[3px]"
            style={{
              left: "calc(50% - 6px)",
              background: tone,
              boxShadow: `0 0 10px -1px ${tone}`,
              animation: animateIn ? "bolt-seal 700ms var(--ease-back) 1.45s both" : undefined,
            }}
          />
        ) : verdict !== "pending" ? (
          <>
            <span
              aria-hidden
              className="absolute top-1/2 h-[12px] w-[12px] -translate-y-1/2 rounded-[3px] bg-accent"
              style={{
                left: "calc(38% - 14px)",
                boxShadow: "0 0 10px -1px var(--accent-50)",
                animation: animateIn
                  ? "bolt-jam 900ms var(--ease-back) 1.45s both"
                  : undefined,
              }}
            />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-dashed border-ice-45"
              style={{ animation: "frost-pulse 2.8s ease-in-out infinite" }}
            />
          </>
        ) : null}
      </div>
      <div
        className={animateIn ? "value-arrive" : ""}
        style={animateIn ? { animationDelay: "1.9s" } : undefined}
      >
        {stamp}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- engine */

export function SweepEngine({
  cells,
  verdict,
  missingFact,
  stamp,
  columns = 4,
  animateIn = false,
  beam = true,
  className = "",
}: {
  cells: FactCell[];
  verdict: Verdict;
  missingFact?: string | null;
  stamp: ReactNode;
  columns?: number;
  animateIn?: boolean;
  beam?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`} data-signature="cold-spot-sweep">
      <div
        className="relative overflow-hidden rounded-[10px]"
        style={{ containerType: "inline-size" }}
      >
        {beam && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-[72px]"
            style={{
              left: "-72px",
              background:
                "linear-gradient(90deg, transparent, var(--accent-12) 60%, var(--accent-30) 100%)",
              borderRight: "1px solid var(--accent-50)",
              animation: "beam-sweep 6.5s ease-in-out infinite alternate",
              ["--beam-travel" as string]: "calc(100cqw + 72px)",
            }}
          />
        )}
        <div
          className="relative grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cells.map((c, i) => (
            <Cell key={c.id} cell={c} index={i} animateIn={animateIn} />
          ))}
        </div>
      </div>
      <Gate verdict={verdict} stamp={stamp} animateIn={animateIn} />
      {verdict === "abstain" && missingFact && (
        <p className="mt-2 font-mono text-[12px] leading-relaxed text-ice">
          <span className="eyebrow-ice mr-2">missing fact</span>
          {missingFact}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------- mini lattice (queue rows) */

export function MiniLattice({
  warm,
  cold,
  verdict,
  title,
}: {
  warm: number;
  cold: number;
  verdict: Verdict;
  title?: string;
}) {
  // Pending = not yet investigated: the full 8-fact schema rendered as hollow,
  // unswept cells. Never ice (ice means "a required fact is MISSING", not
  // "not looked yet").
  const pending = verdict === "pending" || warm + cold === 0;
  const total = pending ? 8 : Math.max(warm + cold, 1);
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      role="img"
      aria-label={title ?? (pending ? "not yet investigated · 8 facts unswept" : `${warm} of ${total} facts resolved`)}
      title={title ?? (pending ? "not yet investigated · 8 facts unswept" : `${warm}/${total} facts resolved`)}
    >
      {Array.from({ length: total }).map((_, i) => {
        if (pending) {
          return (
            <span
              key={i}
              className="h-[10px] w-[10px] rounded-[2px] border border-ink-18 bg-transparent"
            />
          );
        }
        const isCold = i >= warm;
        return (
          <span
            key={i}
            className={
              isCold
                ? "h-[10px] w-[10px] rounded-[2px] border border-dashed border-ice-45 bg-transparent"
                : "h-[10px] w-[10px] rounded-[2px] bg-accent"
            }
            style={
              isCold
                ? { animation: "frost-pulse 2.8s ease-in-out infinite" }
                : { opacity: 0.55 + 0.45 * ((i % 3) / 2), boxShadow: "0 0 6px -1px var(--accent-30)" }
            }
          />
        );
      })}
      <span
        aria-hidden
        className={`ml-1.5 h-[3px] w-[18px] rounded-full ${
          verdict === "reserve" ? "bg-jade" : verdict === "deny" ? "bg-garnet" : "bg-ink-12"
        }`}
        style={
          verdict === "abstain"
            ? { background: "linear-gradient(90deg, var(--ice-45) 35%, transparent 35% 65%, var(--ice-45) 65%)" }
            : undefined
        }
      />
    </span>
  );
}

/* -------------------------------------------------------------- logo mark */

export function ColdspotMark({ size = 20 }: { size?: number }) {
  // THE COLDSPOT MARK: a warm thermal field of coverage facts with the ONE cold spot
  // the lamp cannot warm, in focus at upper-right. The same object as the wordmark's O
  // (just zoomed in). Token-exact (CSS vars), matches public/logo.svg + src/app/icon.svg.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <defs>
        <radialGradient id="csm-field" cx="0.44" cy="0.46" r="0.6">
          <stop offset="0" stopColor="var(--accent-hi)" />
          <stop offset="0.5" stopColor="var(--accent)" />
          <stop offset="0.85" stopColor="var(--accent-deep)" />
          <stop offset="1" stopColor="var(--accent-deep)" stopOpacity="0" />
        </radialGradient>
        <filter id="csm-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <radialGradient id="csm-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--ice)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--ice)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="csm-core" cx="0.42" cy="0.38" r="0.6">
          <stop offset="0" stopColor="#eaf6fb" />
          <stop offset="0.6" stopColor="var(--ice)" />
          <stop offset="1" stopColor="var(--ice-deep)" />
        </radialGradient>
      </defs>
      {/* the warm thermal field of facts */}
      <circle cx="30" cy="31" r="26" fill="url(#csm-field)" filter="url(#csm-soft)" />
      {/* the one cold spot the lamp cannot warm */}
      <circle cx="40.5" cy="25.5" r="13" fill="url(#csm-halo)" />
      <circle cx="40.5" cy="25.5" r="7" fill="var(--void)" opacity="0.5" />
      <circle cx="40.5" cy="25.5" r="6" fill="url(#csm-core)" />
      <circle cx="40.5" cy="25.5" r="6" fill="none" stroke="#eaf6fb" strokeWidth="0.7" opacity="0.8" />
    </svg>
  );
}
