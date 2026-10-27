// File: src/components/PortfolioDashboard.tsx
// C3 — the portfolio "ongoing work" surface. A pure VIEW over GET /api/portfolio, which projects the
// Meterless World Model (event-sourced coverage-state FOLD) over the real H-MEM ledger stream. Every
// number here traces to a real earned ledger event — the World Model never synthesizes a figure.
//
// The money beat: systemic coverage-gap ("cold-spot") CLUSTERS across the book — how many claims are
// held on the SAME missing fact, and the addressable upside (counterfactual total) if that gap closed.
// Identity: clusters speak ICE (they ARE the cold spots); reserved speaks jade; chrome stays amber.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VerdictChip } from "@/components/cold/Chrome";
import { MiniLattice, type Verdict } from "@/components/cold/Sweep";

interface GapCluster {
  missingFact: string;
  claims: number;
  counterfactualTotal: number;
}
interface Book {
  claims: number;
  reserved: number;
  abstained: number;
  pending: number;
  totalReserved: number;
  totalCounterfactual: number;
  verifiedRate: number;
  gapClusters: GapCluster[];
}
interface Claim {
  claimId: string;
  verdict: Verdict;
  reserveAmount: number | null;
  missingFact: string | null;
  counterfactualAmount: number | null;
  verified: boolean;
  sourcesProbed: number;
  sourcesConfirmed: number;
  sourcesDiscarded: number;
  femaProvenance: "live" | "seeded-real" | null;
}
interface Payload {
  book: Book;
  claims: Claim[];
  eventCount: number;
  source: string;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Payload };

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function PortfolioDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    // Merge the full seeded estate (/api/claims) with the ledger projection so
    // the book NEVER under-reports: claims with no ledger events render as
    // unswept rows instead of silently vanishing from the count (one-story law).
    Promise.allSettled([
      fetch("/api/portfolio").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/api/claims").then((r) => r.json()),
    ]).then(([portRes, claimsRes]) => {
      if (!alive) return;
      if (portRes.status !== "fulfilled" || !portRes.value?.book) {
        setState({
          status: "error",
          message: portRes.status === "rejected" ? String(portRes.reason) : "no book in payload",
        });
        return;
      }
      const data = portRes.value as Payload;
      const seeded =
        claimsRes.status === "fulfilled" && Array.isArray(claimsRes.value?.claims)
          ? (claimsRes.value.claims as { claimId: string }[])
          : [];
      const known = new Set(data.claims.map((c) => c.claimId));
      const unswept = seeded.filter((c) => !known.has(c.claimId));
      const merged: Payload = {
        ...data,
        claims: [
          ...data.claims,
          ...unswept.map((c) => ({
            claimId: c.claimId,
            verdict: "pending" as Verdict,
            reserveAmount: null,
            missingFact: null,
            counterfactualAmount: null,
            verified: false,
            sourcesProbed: 0,
            sourcesConfirmed: 0,
            sourcesDiscarded: 0,
            femaProvenance: null,
          })),
        ],
        book: {
          ...data.book,
          claims: data.book.claims + unswept.length,
          pending: data.book.pending + unswept.length,
        },
      };
      setState({ status: "ready", data: merged });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="card-flat h-24 animate-pulse" />
        <div className="card-flat h-40 animate-pulse" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="card border-garnet-25 p-3 text-[13px] text-garnet">
        Could not load the portfolio: {state.message}
      </p>
    );
  }

  const { book, claims, eventCount } = state.data;

  return (
    <div className="space-y-7">
      {/* Book-level coverage state: ONE instrument band — the book rendered as a
          field of lattices (the aggregate IS the motif), money as display
          numerals, verification as a meter. Not a stat grid. */}
      <section className="card p-5">
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr_1fr]">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
              the book · {book.claims} claim{book.claims === 1 ? "" : "s"}
            </p>
            <div className="mt-3 space-y-2">
              {claims.map((c) => (
                <div key={`field-${c.claimId}`} className="flex items-center gap-3">
                  <MiniLattice
                    warm={c.verdict === "pending" ? 0 : 8 - (c.verdict === "abstain" ? 1 : 0)}
                    cold={c.verdict === "abstain" ? 1 : 0}
                    verdict={c.verdict}
                    title={c.missingFact ? `cold spot: ${c.missingFact}` : c.claimId}
                  />
                  <span className="mono-data text-[11px] text-ink-faint">{c.claimId}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10.5px] text-ink-faint">
              {book.reserved} reserved · {book.abstained} held cold · {book.pending} unswept
            </p>
          </div>
          <div className="border-t border-ink-08 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">reserved</p>
            <p className="numeral value-arrive mt-2 text-[30px] text-jade">
              <span className="unit">$</span>
              {usd(book.totalReserved).slice(1)}
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ice">held on cold spots</p>
            <p className="numeral value-arrive mt-2 text-[30px] text-ice">
              <span className="unit">$</span>
              {usd(book.totalCounterfactual).slice(1)}
            </p>
          </div>
          <div className="border-t border-ink-08 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">decisions verified</p>
            <p className="numeral value-arrive mt-2 text-[30px] text-ink">
              {Math.round(book.verifiedRate * 100)}
              <span className="unit">%</span>
            </p>
            <div className="mt-2.5 h-[4px] w-full overflow-hidden rounded-full bg-ink-06">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${Math.round(book.verifiedRate * 100)}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-faint">re-derived from live sources and matched</p>
          </div>
        </div>
      </section>

      {/* Systemic cold-spot clusters: where the book waits on the SAME missing fact. */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow-ice">systemic cold-spot clusters</h2>
          <span className="font-mono text-[11px] text-ink-faint">
            claims held on the same missing fact
          </span>
        </div>
        {book.gapClusters.length === 0 ? (
          <p className="card-flat mt-2.5 p-4 text-[13px] text-ink-dim">
            No open coverage gaps across the book. Every lattice is warm.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {book.gapClusters.map((g, i) => (
              <li
                key={g.missingFact}
                className="row-in flex items-center justify-between gap-4 rounded-card border border-dashed border-ice-45 bg-ice-10 p-3.5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    aria-hidden
                    className="h-[14px] w-[14px] shrink-0 rounded-[3px] border border-dashed border-ice-45"
                    style={{ animation: "frost-pulse 2.8s ease-in-out infinite" }}
                  />
                  <div>
                    <p className="text-[14px] font-medium text-ice">{g.missingFact}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-dim">
                      {g.claims} claim{g.claims === 1 ? "" : "s"} held on this gap
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                    addressable if closed
                  </p>
                  {g.counterfactualTotal > 0 ? (
                    <p className="numeral mt-0.5 text-[22px] text-ice">
                      <span className="unit">$</span>
                      {Math.round(g.counterfactualTotal).toLocaleString()}
                    </p>
                  ) : (
                    <p className="mt-1 max-w-[200px] font-mono text-[10.5px] leading-relaxed text-ink-dim">
                      $0: even with this fact known, the engine reserves nothing on the
                      current evidence
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Per-claim coverage state (H-MEM across claims). */}
      <section>
        <h2 className="eyebrow !text-ink-faint">per-claim coverage state</h2>
        <div className="mt-2.5 overflow-x-auto rounded-card border border-ink-08">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-ink-08 bg-surface-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <tr>
                <th className="px-3 py-2.5 font-medium">claim</th>
                <th className="px-3 py-2.5 font-medium">verdict</th>
                <th className="px-3 py-2.5 font-medium">lattice</th>
                <th className="px-3 py-2.5 text-right font-medium">reserve / upside</th>
                <th className="px-3 py-2.5 font-medium">sources kept/refused</th>
                <th className="px-3 py-2.5 font-medium">FEMA</th>
                <th className="px-3 py-2.5 font-medium">verified</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr
                  key={c.claimId}
                  className="border-t border-ink-08 transition-colors duration-150 hover:bg-ink-04"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/app/claim/${c.claimId}`}
                      className="mono-data font-semibold text-ink transition-colors hover:text-accent active:text-accent-hi"
                    >
                      {c.claimId}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <VerdictChip verdict={c.verdict} />
                  </td>
                  <td className="px-3 py-2.5">
                    <MiniLattice
                      warm={c.verdict === "pending" ? 0 : 8 - (c.verdict === "abstain" ? 1 : 0)}
                      cold={c.verdict === "abstain" ? 1 : 0}
                      verdict={c.verdict}
                      title={c.missingFact ? `cold spot: ${c.missingFact}` : undefined}
                    />
                  </td>
                  <td className="mono-data px-3 py-2.5 text-right">
                    {c.verdict === "reserve" ? (
                      <span className="text-jade">{usd(c.reserveAmount ?? 0)}</span>
                    ) : c.counterfactualAmount ? (
                      <span className="text-ice">{usd(c.counterfactualAmount)}</span>
                    ) : (
                      <span className="text-ink-faint">·</span>
                    )}
                  </td>
                  <td className="mono-data px-3 py-2.5 text-ink-dim">
                    <span className="text-accent">{c.sourcesConfirmed}</span>
                    <span className="text-ink-faint"> / {c.sourcesDiscarded}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-ink-faint">
                    {c.femaProvenance ?? "·"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    {c.verified ? <span className="text-jade">✓</span> : <span className="text-ink-faint">·</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="font-mono text-[11px] text-ink-faint">
        {eventCount} ledger events folded · {state.data.source}
      </p>
    </div>
  );
}
