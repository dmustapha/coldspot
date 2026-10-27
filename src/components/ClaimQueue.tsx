// File: src/components/ClaimQueue.tsx
// The operator's console: status strip + filterable queue + evidence rail, ALL
// derived from one merged fetch (/api/claims + /api/portfolio) so the strip can
// never contradict the rows it sits above. Each row carries id, verdict chip,
// mini-lattice (the reconcile gate's fixed 8-fact schema; an ABSTAIN row's one
// cold cell is the NAMED missing fact), money, source kept/refused counts,
// verification, and FEMA provenance. Nothing synthesized: states come from the
// ledger projection; claims without ledger events render as unswept.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MiniLattice, type Verdict } from "@/components/cold/Sweep";
import { VerdictChip } from "@/components/cold/Chrome";

interface Claim {
  claimId: string;
  policyId: string;
  peril: string;
  region: string;
}
interface CoverageState {
  verdict: Verdict;
  reserveAmount: number | null;
  counterfactualAmount: number | null;
  missingFact: string | null;
  sourcesConfirmed: number;
  sourcesDiscarded: number;
  verified: boolean;
  femaProvenance: "live" | "seeded-real" | null;
}
interface PortfolioClaim extends CoverageState {
  claimId: string;
}
interface GapCluster {
  missingFact: string;
  claims: number;
  counterfactualTotal: number;
}
interface Book {
  totalReserved: number;
  totalCounterfactual: number;
  gapClusters: GapCluster[];
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      claims: Claim[];
      coverage: Map<string, CoverageState>;
      book: Book | null;
      eventCount: number;
    };

type Filter = "all" | "reserve" | "abstain" | "pending";

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const FACT_SCHEMA_SIZE = 8;

export function ClaimQueue() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      fetch("/api/claims").then((r) => r.json()),
      fetch("/api/portfolio").then((r) => r.json()),
    ]).then(([claimsRes, portRes]) => {
      if (!alive) return;
      const claimsOk = claimsRes.status === "fulfilled" ? claimsRes.value : null;
      if (!claimsOk || (claimsOk.error && (!claimsOk.claims || claimsOk.claims.length === 0))) {
        setState({
          status: "error",
          message: claimsOk?.error ?? String((claimsRes as PromiseRejectedResult).reason ?? "fetch failed"),
        });
        return;
      }
      const coverage = new Map<string, CoverageState>();
      let book: Book | null = null;
      let eventCount = 0;
      if (portRes.status === "fulfilled" && portRes.value) {
        if (Array.isArray(portRes.value.claims)) {
          for (const c of portRes.value.claims as PortfolioClaim[]) coverage.set(c.claimId, c);
        }
        if (portRes.value.book) book = portRes.value.book as Book;
        eventCount = portRes.value.eventCount ?? 0;
      }
      setState({ status: "ready", claims: claimsOk.claims ?? [], coverage, book, eventCount });
    });
    return () => {
      alive = false;
    };
  }, []);

  // ONE derivation feeds both the strip and the rows: counts can never disagree.
  const derived = useMemo(() => {
    if (state.status !== "ready") return null;
    const rows = state.claims.map((c) => {
      const cov = state.coverage.get(c.claimId);
      const verdict: Verdict = cov?.verdict ?? "pending";
      return { ...c, cov, verdict };
    });
    const counts = {
      total: rows.length,
      reserve: rows.filter((r) => r.verdict === "reserve").length,
      abstain: rows.filter((r) => r.verdict === "abstain").length,
      pending: rows.filter((r) => r.verdict === "pending").length,
      refusedSources: rows.reduce((s, r) => s + (r.cov?.sourcesDiscarded ?? 0), 0),
      keptSources: rows.reduce((s, r) => s + (r.cov?.sourcesConfirmed ?? 0), 0),
    };
    return { rows, counts };
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="grid gap-2.5" aria-busy="true" aria-live="polite">
        <p className="font-mono text-[12px] text-ink-faint">
          Sweeping the carrier estate (Oracle ADB can be slow on a cold connect)…
        </p>
        <div className="card-flat h-[46px] animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-flat h-[84px] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="card border-garnet-25 p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-garnet">
          queue unreachable
        </p>
        <p className="mt-2 text-[13.5px] text-ink-dim">
          Could not load the claim queue from the carrier estate.
        </p>
        <p className="mono-data mt-1.5 text-[11px] text-ink-faint">{state.message}</p>
      </div>
    );
  }

  const { rows, counts } = derived!;
  const { book, eventCount } = state;

  if (rows.length === 0) {
    return (
      <div className="card-flat flex flex-col items-center gap-3 p-10 text-center">
        <span className="inline-flex gap-[3px]" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="h-[10px] w-[10px] rounded-[2px] border border-dashed border-ink-18" />
          ))}
        </span>
        <p className="text-[13.5px] text-ink-dim">
          No claims seeded yet. Run the demo seed to populate the queue.
        </p>
      </div>
    );
  }

  const shown = rows.filter((r) => filter === "all" || r.verdict === filter);
  const stripCell = "flex items-baseline gap-1.5";
  const stripLabel = "font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint";
  const stripNum = "mono-data text-[13px] font-semibold";

  const filterChip = (key: Filter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      aria-pressed={filter === key}
      className={`rounded-chip border px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] transition-colors duration-150 active:bg-ink-12 ${
        filter === key
          ? "border-accent-30 bg-accent-12 text-accent-hi"
          : "border-ink-12 text-ink-dim hover:border-ink-18 hover:text-ink"
      }`}
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div>
        {/* Status strip: derived from the SAME rows it sits above. */}
        <div className="card-flat flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <span className={stripCell}>
            <span className={`${stripNum} text-ink value-arrive`}>{counts.total}</span>
            <span className={stripLabel}>claims</span>
          </span>
          <span className={stripCell}>
            <span className={`${stripNum} text-jade value-arrive`}>{counts.reserve}</span>
            <span className={stripLabel}>reserved</span>
          </span>
          <span className={stripCell}>
            <span className={`${stripNum} text-ice value-arrive`}>{counts.abstain}</span>
            <span className={stripLabel}>held cold</span>
          </span>
          <span className={stripCell}>
            <span className={`${stripNum} text-ink-dim value-arrive`}>{counts.pending}</span>
            <span className={stripLabel}>unswept</span>
          </span>
          {book && (
            <>
              <span aria-hidden className="h-4 w-px bg-ink-12" />
              <span className={stripCell}>
                <span className={`${stripNum} text-jade value-arrive`}>{usd(book.totalReserved)}</span>
                <span className={stripLabel}>reserved</span>
              </span>
              <span className={stripCell}>
                <span className={`${stripNum} text-ice value-arrive`}>{usd(book.totalCounterfactual)}</span>
                <span className={stripLabel}>addressable</span>
              </span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-accent"
              style={{ animation: "cell-smoulder 2.4s ease-in-out infinite" }}
            />
            <span className="font-mono text-[10.5px] text-ink-faint">{eventCount} ledger events folded</span>
          </span>
        </div>

        {/* Filter: what can I act on. */}
        <div className="mt-3 flex items-center gap-1.5">
          {filterChip("all", "all", counts.total)}
          {filterChip("reserve", "reserved", counts.reserve)}
          {filterChip("abstain", "held cold", counts.abstain)}
          {filterChip("pending", "unswept", counts.pending)}
        </div>

        <ul className="mt-3 grid gap-2.5">
          {shown.map((r, i) => {
            const cov = r.cov;
            const verdict = r.verdict;
            const cold = verdict === "abstain" ? 1 : 0;
            const warm = cov && verdict !== "pending" ? FACT_SCHEMA_SIZE - cold : 0;
            return (
              <li key={r.claimId} className="row-in" style={{ animationDelay: `${i * 70}ms` }}>
                <Link
                  href={`/app/claim/${r.claimId}`}
                  className="card group block p-4 transition-colors duration-150 hover:border-accent-30 active:border-accent-50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="mono-data text-[14px] font-semibold text-ink">{r.claimId}</span>
                      <VerdictChip verdict={verdict} />
                    </div>
                    <div className="flex items-center gap-4">
                      {verdict === "reserve" && cov?.reserveAmount != null && (
                        <span className="mono-data text-[13px] text-jade">{usd(cov.reserveAmount)}</span>
                      )}
                      {verdict === "abstain" && cov?.counterfactualAmount != null && (
                        <span className="mono-data text-[13px] text-ink-dim">
                          held <span className="text-ice">{usd(cov.counterfactualAmount)}</span>
                        </span>
                      )}
                      <MiniLattice
                        warm={warm}
                        cold={cold}
                        verdict={verdict}
                        title={
                          cov && verdict !== "pending"
                            ? verdict === "abstain"
                              ? `cold spot named: ${cov.missingFact ?? "a required fact is missing"}`
                              : "required facts resolved"
                            : "not yet investigated · 8 facts unswept"
                        }
                      />
                      <span className="font-mono text-[11px] text-ink-faint transition-colors duration-150 group-hover:text-accent">
                        open →
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 border-t border-ink-08 pt-2">
                    <span className="text-[12.5px] text-ink-dim">
                      <span className="capitalize">{r.peril}</span> · policy{" "}
                      <span className="mono-data">{r.policyId}</span> · {r.region}
                    </span>
                    {cov && verdict !== "pending" ? (
                      <span className="flex items-center gap-3 font-mono text-[11px] text-ink-faint">
                        <span>
                          <span className="text-accent">{cov.sourcesConfirmed}</span>
                          <span> sweeps kept / {cov.sourcesDiscarded} refused</span>
                        </span>
                        {cov.femaProvenance && <span>FEMA {cov.femaProvenance}</span>}
                        <span className={cov.verified ? "text-jade" : "text-ink-faint"}>
                          {cov.verified ? "✓ re-derived" : "unverified"}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-ink-faint">
                        no ledger events yet · open to run the first sweep
                      </span>
                    )}
                  </div>
                  {verdict === "abstain" && cov?.missingFact && (
                    <p className="mt-1.5 truncate font-mono text-[11px] text-ice">
                      cold spot: {cov.missingFact}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="card-flat p-6 text-center font-mono text-[12px] text-ink-faint">
              no claims in this state
            </li>
          )}
        </ul>
      </div>

      {/* Evidence rail: what happened across the book (all real, from the fold). */}
      <aside className="space-y-3 lg:pt-0">
        <div className="card-flat p-4">
          <p className="eyebrow-ice">open cold spots</p>
          {book && book.gapClusters.length > 0 ? (
            <ul className="mt-2.5 space-y-2.5">
              {book.gapClusters.map((g) => (
                <li key={g.missingFact} className="border-l border-ice-28 pl-2.5">
                  <p className="text-[12.5px] leading-snug text-ice">{g.missingFact}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                    {g.claims} claim{g.claims === 1 ? "" : "s"} held ·{" "}
                    {usd(g.counterfactualTotal)} addressable
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-ink-dim">none open across the book</p>
          )}
        </div>
        <div className="card-flat p-4">
          <p className="eyebrow !text-ink-faint">source sweeps</p>
          <dl className="mt-2.5 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">kept</dt>
              <dd className="mono-data text-[13px] text-accent">{counts.keptSources}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">refused, with reasons</dt>
              <dd className="mono-data text-[13px] text-ink-dim">{counts.refusedSources}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">ledger events</dt>
              <dd className="mono-data text-[13px] text-ink">{eventCount}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-ink-08 pt-2.5 text-[11.5px] leading-relaxed text-ink-dim">
            Every refusal is written down. Open a claim to read its discard reasons
            verbatim.
          </p>
        </div>
        <Link
          href="/portfolio"
          className="card-flat block p-4 transition-colors duration-150 hover:border-ink-18 active:bg-ink-06"
        >
          <p className="eyebrow !text-ink-faint">book view</p>
          <p className="mt-1.5 text-[12.5px] text-ink-dim">
            Aggregate coverage state and systemic cold-spot clusters →
          </p>
        </Link>
      </aside>
    </div>
  );
}
