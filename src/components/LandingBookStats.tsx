// File: src/components/LandingBookStats.tsx
// The landing proof band's numbers, ACTUALLY projected from the ledger via
// /api/portfolio (the same World Model fold the console uses). Rendered as a
// metered ledger (label / numeral / track), not a stat grid: the numbers ride
// inside the instrument's own construction. Degrades honestly if unreachable.
"use client";

import { useEffect, useState } from "react";

interface Book {
  totalReserved: number;
  totalCounterfactual: number;
  verifiedRate: number;
  abstained: number;
  claims: number;
}
interface PortfolioClaim {
  sourcesDiscarded: number;
  sourcesConfirmed: number;
}

type State =
  | { status: "loading" }
  | { status: "degraded" }
  | { status: "ready"; book: Book; refused: number; kept: number };

const usd = (n: number) => Math.round(n).toLocaleString();

function Row({
  label,
  value,
  sub,
  tone = "ink",
  fraction,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "ink" | "jade" | "ice" | "accent";
  fraction: number; // 0..1 meter fill
}) {
  const color =
    tone === "jade" ? "text-jade" : tone === "ice" ? "text-ice" : tone === "accent" ? "text-accent" : "text-ink";
  const fill =
    tone === "jade" ? "var(--jade)" : tone === "ice" ? "var(--ice-45)" : "var(--accent)";
  const dashed = tone === "ice";
  return (
    <div className="border-t border-ink-08 py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
          {label}
        </span>
        <span className={`numeral value-arrive text-[26px] ${color}`}>{value}</span>
      </div>
      <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-ink-06">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(2, Math.min(100, fraction * 100))}%`,
            background: dashed
              ? `repeating-linear-gradient(90deg, ${fill} 0 6px, transparent 6px 10px)`
              : fill,
          }}
        />
      </div>
      {sub && <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}

export function LandingBookStats() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/portfolio")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        if (!d?.book) {
          setState({ status: "degraded" });
          return;
        }
        const claims = Array.isArray(d.claims) ? (d.claims as PortfolioClaim[]) : [];
        setState({
          status: "ready",
          book: d.book as Book,
          refused: claims.reduce((s, c) => s + (c.sourcesDiscarded ?? 0), 0),
          kept: claims.reduce((s, c) => s + (c.sourcesConfirmed ?? 0), 0),
        });
      })
      .catch(() => alive && setState({ status: "degraded" }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return <div className="card h-[320px] animate-pulse" aria-busy="true" />;
  }

  if (state.status === "degraded") {
    return (
      <div className="card-flat flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="inline-flex gap-[4px]" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="h-[12px] w-[12px] rounded-[2px] border border-ink-18" />
          ))}
        </span>
        <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-faint">
          book projection unreachable
        </p>
        <p className="max-w-[260px] text-[12.5px] text-ink-dim">
          These numbers only render from the live ledger fold. No cached copy is shown.
        </p>
      </div>
    );
  }

  const { book, refused, kept } = state;
  const exposure = book.totalReserved + book.totalCounterfactual || 1;
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="eyebrow !text-ink-faint">the book, live from the fold</span>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-faint">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-accent"
            style={{ animation: "cell-smoulder 2.4s ease-in-out infinite" }}
          />
          projected live
        </span>
      </div>
      <Row
        label="book reserved"
        value={
          <>
            <span className="unit">$</span>
            {usd(book.totalReserved)}
          </>
        }
        tone="jade"
        fraction={book.totalReserved / exposure}
        sub="reserves issued on complete evidence"
      />
      <Row
        label="held on cold spots"
        value={
          <>
            <span className="unit">$</span>
            {usd(book.totalCounterfactual)}
          </>
        }
        tone="ice"
        fraction={book.totalCounterfactual / exposure}
        sub={`${book.abstained} claim${book.abstained === 1 ? "" : "s"} held · addressable if the gap closes`}
      />
      <Row
        label="decisions verified"
        value={
          <>
            {Math.round(book.verifiedRate * 100)}
            <span className="unit">%</span>
          </>
        }
        tone="accent"
        fraction={book.verifiedRate}
        sub="re-derived from live sources and matched"
      />
      <Row
        label="sources refused across the book"
        value={refused}
        fraction={refused / Math.max(refused + kept, 1)}
        sub="every discard written down, with its reason"
      />
    </div>
  );
}
