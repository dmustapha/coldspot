// File: src/components/cold/Chrome.tsx
// Shared chrome for every surface: the opaque hairline nav (no glass anywhere),
// verdict/state chips (semantic colors are DATA-only), provenance chips, and the
// display-numeral stat. One vocabulary, every page.

import Link from "next/link";
import { ColdspotMark } from "./Sweep";
import type { Verdict } from "./Sweep";

export function SiteNav({ active }: { active?: "app" | "demo" | "proof" | "portfolio" }) {
  const item = (href: string, key: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`rounded-chip px-3 py-1.5 text-[13px] transition-colors duration-150 hover:text-ink active:bg-ink-08 ${
        active === key ? "bg-ink-06 text-ink" : "text-ink-dim"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-ink-08 bg-surface-1">
      <nav className="mx-auto flex h-[52px] max-w-6xl items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-[15px] font-extrabold tracking-tight text-ink"
        >
          <ColdspotMark size={20} />
          COLDSPOT
        </Link>
        <div className="flex items-center gap-1">
          {item("/app", "app", "Console")}
          {item("/portfolio", "portfolio", "Portfolio")}
          {item("/proof", "proof", "Proof")}
          {item("/demo", "demo", "Judge replay")}
          <Link
            href="/app"
            className="ml-3 rounded-chip bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-[oklch(18%_0.02_75)] transition-colors duration-150 hover:bg-accent-hi active:bg-accent-deep"
          >
            Open the console
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* Verdict chips — hue + SHAPE, identical everywhere (rows, badges, panels). */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  if (verdict === "reserve")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip border border-jade-25 bg-jade-12 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.1em] text-jade">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade" />
        RESERVE
      </span>
    );
  if (verdict === "deny")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip border border-garnet-25 bg-garnet-12 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.1em] text-garnet">
        <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-garnet" />
        DENY
      </span>
    );
  if (verdict === "abstain")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip border border-dashed border-ice-45 bg-ice-10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.1em] text-ice">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-[1px] border border-dashed border-ice-45"
        />
        ABSTAIN
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip border border-ink-12 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-faint">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-ink-30" />
      PENDING
    </span>
  );
}

/* Provenance chip — every number that claims reality names where it came from. */
export function ProvChip({ children, degraded = false }: { children: React.ReactNode; degraded?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[11px] ${
        degraded
          ? "border border-dashed border-ink-18 text-ink-faint"
          : "border border-ink-12 text-ink-dim"
      }`}
    >
      <span
        aria-hidden
        className={`h-1 w-1 rounded-full ${degraded ? "bg-ink-30" : "bg-accent"}`}
      />
      {children}
    </span>
  );
}

/* Display-numeral stat — the instrument voice for aggregates. */
export function Stat({
  label,
  value,
  unit,
  tone = "ink",
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "ink" | "jade" | "garnet" | "ice" | "accent";
  sub?: string;
}) {
  const color =
    tone === "jade"
      ? "text-jade"
      : tone === "garnet"
        ? "text-garnet"
        : tone === "ice"
          ? "text-ice"
          : tone === "accent"
            ? "text-accent"
            : "text-ink";
  return (
    <div className="card-flat p-3.5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">{label}</p>
      <p className={`numeral mt-1.5 text-[26px] ${color}`}>
        {unit && unit !== "%" ? <span className="unit mr-0.5">{unit}</span> : null}
        {value}
        {unit === "%" ? <span className="unit">%</span> : null}
      </p>
      {sub ? <p className="mt-1 font-mono text-[11px] text-ink-faint">{sub}</p> : null}
    </div>
  );
}
