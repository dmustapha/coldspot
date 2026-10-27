// File: src/app/page.tsx  (/ landing — the pitch)
// Marketing surface of the thermogram identity. The hero runs the SIGNATURE on the
// REAL hero case (CLM-4471): the facts below are the reconcile entry's own facts
// object and the decision entry's own missing_fact, verbatim from the committed
// Trust Ledger. Nothing invented; the engine is the pitch.
import Link from "next/link";
import { SweepEngine, type FactCell } from "@/components/cold/Sweep";
import { SiteNav, ProvChip } from "@/components/cold/Chrome";
import { LandingBookStats } from "@/components/LandingBookStats";

// CLM-4471 reconcile facts, verbatim from the committed abstain run in
// evidence/ledger/ledger.jsonl: catWindow AND lossInsideCatWindow were both
// null when the gate refused (the decision names the loss-in-window fact; the
// CAT window itself was also unresolved in that run).
const HERO_CELLS: FactCell[] = [
  { id: "baseLimit", label: "base limit $5.0M", state: "warm" },
  { id: "sublimit", label: "sublimit $1.0M", state: "warm" },
  { id: "peril", label: "peril: fire", state: "warm" },
  { id: "cession", label: "cession 40%", state: "warm" },
  { id: "catSublimit", label: "CAT sublimit $2.0M", state: "warm" },
  { id: "reported", label: "reported $1.25M", state: "warm" },
  { id: "catWindow", label: "CAT window", state: "cold" },
  { id: "lossInWindow", label: "loss in window", state: "cold" },
];

const SOURCES_KEPT = [
  { id: "oracle_policy", note: "schema match, 1 row, fresh" },
  { id: "endorsement_rows", note: "schema match, 1 row, fresh" },
  { id: "treaty_api", note: "schema match, 1 row, fresh" },
  { id: "openfema", note: "DR-4844-FL, Hurricane Milton" },
];
const SOURCES_DISCARDED = [
  { id: "legacy_notes", note: "stale, 2794d > 365d; 0 rows match POL-1001" },
  { id: "damage_photo", note: "no readable image evidence" },
];

const STEPS = [
  {
    n: "01",
    title: "Discover the sources",
    body: "Probes the carrier estate, keeps what governs this claim, and discards decoys with a signal-derived reason it writes down.",
    chip: 'legacy_notes: "stale (last refreshed 2019-03-01, 2794d > 365d); 0 rows match policy POL-1001"',
  },
  {
    n: "02",
    title: "Federate, in place",
    body: "One governed Zetaris Lightning SQL query joins policy admin, endorsements, and the reinsurance treaty where they live. The data never centralizes; governance stays intact.",
    chip: 'federate: ["FILES.policy", "FILES.endorsement", "SRC.treaty"] · 1 row',
  },
  {
    n: "03",
    title: "Reconcile completeness",
    body: "A deterministic gate checks whether the evidence set can support a confident decision. Each required fact is a cell; any cold cell holds the gate open.",
    chip: "facts: { baseLimit, sublimit, peril, cession, reported, catWindow, lossInsideCatWindow: null }",
  },
  {
    n: "04",
    title: "Decide, or refuse",
    body: "Nemotron reasons over the warm cells and issues a reserve, or abstains, naming the exact missing fact and the source that resolves it. Every sentence cites its lineage.",
    chip: 'abstain: missing_fact = "loss date inside the declared CAT event window"',
  },
];

export default function Landing() {
  return (
    <>
      <SiteNav />
      <main>
        {/* ============================================================ HERO */}
        <section className="relative overflow-hidden border-b border-ink-08">
          {/* layer 1: cold ground is the body void; layer 2: survey ruling */}
          <div aria-hidden className="survey-ruling absolute inset-0" />
          {/* layer 3: the lamp, breathing (the one living atmosphere layer) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[30%] top-0 h-[90vh] w-[55vw] rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, var(--accent-30), var(--accent-12) 45%, transparent 75%)",
              animation: "lamp-breathe 7s ease-in-out infinite",
            }}
          />
          {/* layer 4: frost pooling at the right edge, where the cold spot lives */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[10%] top-[20%] h-[70vh] w-[36vw] rounded-full blur-3xl"
            style={{
              background: "radial-gradient(closest-side, var(--ice-16), transparent 70%)",
            }}
          />

          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <p className="eyebrow rise-in">P&amp;C coverage investigation · Track 02: the agent that can explain why</p>
              <h1
                className="display rise-in mt-5 text-[clamp(2.9rem,5.4vw,4.9rem)] text-ink"
                style={{ animationDelay: "90ms" }}
              >
                Every fact, under the lamp.
                <br />
                <span className="text-ice">The missing one, named.</span>
              </h1>
              <p
                className="rise-in mt-6 max-w-xl text-[16px] leading-relaxed text-ink-dim"
                style={{ animationDelay: "180ms" }}
              >
                COLDSPOT investigates a disputed claim across the carrier&apos;s scattered
                systems, federates them through one governed Zetaris query, and decides
                coverage with Nemotron. When a required fact is missing it refuses to
                guess: it shows you the cold spot instead.
              </p>
              <div className="rise-in mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "260ms" }}>
                <Link
                  href="/app"
                  className="rounded-chip bg-accent px-5 py-2.5 text-[14px] font-semibold text-[oklch(18%_0.02_75)] transition-colors duration-150 hover:bg-accent-hi active:bg-accent-deep"
                >
                  Open the claim queue
                </Link>
                <Link
                  href="/demo"
                  className="rounded-chip border border-ink-18 px-5 py-2.5 text-[14px] text-ink transition-colors duration-150 hover:border-ink-30 hover:bg-ink-06 active:bg-ink-12"
                >
                  Judge? Replay CLM-4471
                </Link>
              </div>
              <p className="rise-in mt-5 font-mono text-[11.5px] text-ink-faint" style={{ animationDelay: "320ms" }}>
                real governed sources · append-only Trust Ledger · every number recomputable from seed
              </p>
            </div>

            {/* The signature, performing the hero case. */}
            <div className="card relative p-5" style={{ boxShadow: "var(--glow-lamp)" }}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="truncate font-mono text-[12px] font-semibold text-ink">
                  CLM-4471 <span className="text-ink-faint">· hurricane · POL-1001 · FL</span>
                </span>
                <span className="eyebrow-ice shrink-0">replayed from the ledger</span>
              </div>
              <SweepEngine
                cells={HERO_CELLS}
                verdict="abstain"
                missingFact="whether the loss date falls inside the declared CAT event window"
                animateIn
                columns={4}
                stamp={
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.25em] text-ice">
                      Abstain · gate held open
                    </span>
                    <span className="font-mono text-[12px] text-ink-dim">
                      if known: reserve <span className="text-jade">$750,000</span>
                    </span>
                  </div>
                }
              />
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-ink-08 pt-4">
                <p className="eyebrow col-span-2 !text-ink-faint">sources · kept 4 / discarded 2</p>
                {SOURCES_KEPT.map((s) => (
                  <p key={s.id} className="font-mono text-[11px] leading-relaxed text-ink-dim">
                    <span className="text-accent">●</span> {s.id}{" "}
                    <span className="text-ink-faint">{s.note}</span>
                  </p>
                ))}
                {SOURCES_DISCARDED.map((s) => (
                  <p key={s.id} className="font-mono text-[11px] leading-relaxed text-ink-faint">
                    ○ <span className="line-through decoration-ink-30">{s.id}</span>{" "}
                    {s.note}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================== STAKES */}
        <section className="relative overflow-hidden border-b border-ink-08 bg-surface-1">
          <span
            aria-hidden
            className="case-stamp pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 text-[clamp(7rem,16vw,13rem)]"
          >
            EXHIBIT A
          </span>
          <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <p className="eyebrow">the leak</p>
              <p className="numeral mt-4 text-[clamp(4.5rem,9vw,8rem)] text-ink">
                <span className="unit">$</span>30<span className="unit">B</span>
                <span className="unit text-ink-faint">/yr</span>
              </p>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-ink-dim">
                P&amp;C underwriting leakage from fragmented coverage data. Industry
                estimate; framing in the project brief.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="card p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">wrong call, one way</p>
                <p className="mt-2 text-[15px] text-ink">
                  Pay a claim the policy never covered. The leakage compounds silently,
                  cycle after cycle.
                </p>
              </div>
              <div className="card p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">wrong call, the other way</p>
                <p className="mt-2 text-[15px] text-ink">
                  Deny a claim that was covered. Now it is bad faith, regulators, and a
                  courtroom asking for your lineage.
                </p>
              </div>
              <div className="card border-ice-28 p-5">
                <p className="eyebrow-ice">the coldspot answer</p>
                <p className="mt-2 text-[15px] text-ink">
                  An overconfident answer is the expensive one. COLDSPOT&apos;s value is the
                  honest refusal: surface the missing fact instead of hallucinating a
                  confident call.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================= HOW */}
        <section className="relative border-b border-ink-08">
          <div aria-hidden className="survey-ruling absolute inset-0 opacity-60" />
          <div className="relative mx-auto max-w-6xl px-5 py-20">
            <p className="eyebrow">how it investigates</p>
            <h2 className="display mt-3 max-w-2xl text-[clamp(1.9rem,3.2vw,2.9rem)] text-ink">
              Four moves. Every one leaves a receipt.
            </h2>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {STEPS.map((s, i) => (
                <div key={s.n} className={`card p-5 ${i === 3 ? "border-ice-28" : ""}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="numeral text-[30px] text-accent">{s.n}</span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
                      {i === 1 ? "Zetaris" : i === 3 ? "Nemotron" : "coldspot core"}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-[19px] font-700 text-ink" style={{ fontWeight: 700 }}>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">{s.body}</p>
                  <p className="mono-data mt-4 overflow-x-auto rounded-chip border border-ink-08 bg-[oklch(14%_0.014_230)] px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
                    {s.chip}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================ PROOF / HONESTY */}
        <section className="relative overflow-hidden border-b border-ink-08 bg-surface-1">
          <span
            aria-hidden
            className="case-stamp pointer-events-none absolute -left-4 bottom-0 text-[clamp(6rem,13vw,11rem)]"
          >
            CLM-4471
          </span>
          <div className="relative mx-auto max-w-6xl px-5 py-20">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
              <div>
                <p className="eyebrow">the record stands</p>
                <h2 className="display mt-3 text-[clamp(1.9rem,3.2vw,2.9rem)] text-ink">
                  Numbers you can re-derive, not just read.
                </h2>
                <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-ink-dim">
                  Every headline number recomputes from the committed seed by
                  scripts/verify-claims.ts, never read back from a cached artifact. The
                  Trust Ledger is append-only: every probe, discard, federate, reconcile,
                  and refusal on the record, in order, forever.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <ProvChip>ledger: evidence/ledger/ledger.jsonl</ProvChip>
                  <ProvChip>recompute: /api/claim/[id]/recompute</ProvChip>
                  <ProvChip>evals: evidence/*.json</ProvChip>
                </div>
                <Link
                  href="/proof"
                  className="mt-7 inline-block rounded-chip border border-ink-18 px-5 py-2.5 text-[14px] text-ink transition-colors duration-150 hover:border-ink-30 hover:bg-ink-06 active:bg-ink-12"
                >
                  Open the proof surface
                </Link>
              </div>
              <LandingBookStats />
            </div>
          </div>
        </section>

        {/* ========================================================== CLOSER */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[80vh] w-[50vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--ice-16), transparent 70%)" }}
          />
          {/* Full-bleed set-piece: the sweep at field scale. The beam crosses the
              book's facts, SNAGS on the one cold cell (choreographed recoil), and
              moves on; the cold cell stays. The metaphor, performed. */}
          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-5 py-24 text-center">
            <div className="relative h-[22px] w-full max-w-3xl overflow-visible" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
                {Array.from({ length: 24 }).map((_, i) =>
                  i === 14 ? (
                    <span
                      key={i}
                      className="h-[16px] w-[16px] rounded-[3px] border border-dashed border-ice-45"
                      style={{ animation: "frost-pulse 2.8s ease-in-out infinite" }}
                    />
                  ) : (
                    <span
                      key={i}
                      className="h-[16px] w-[16px] rounded-[3px] bg-accent"
                      style={{ opacity: 0.25 + ((i * 7) % 5) * 0.14 }}
                    />
                  ),
                )}
              </span>
              <span
                className="pointer-events-none absolute -bottom-2 -top-2 w-[46px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--accent-18) 60%, var(--accent-50) 100%)",
                  borderRight: "1px solid var(--accent-hi)",
                  animation: "closer-beam 8s ease-in-out infinite",
                }}
              />
            </div>
            <h2 className="display mt-10 max-w-3xl text-[clamp(2.1rem,4vw,3.4rem)] text-ink [text-wrap:balance]">
              The answer you can defend
              <br />
              <span className="text-ice">starts with the fact you admit you are missing.</span>
            </h2>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/app"
                className="rounded-chip bg-accent px-5 py-2.5 text-[14px] font-semibold text-[oklch(18%_0.02_75)] transition-colors duration-150 hover:bg-accent-hi active:bg-accent-deep"
              >
                Open the console
              </Link>
              <Link
                href="/portfolio"
                className="rounded-chip border border-ink-18 px-5 py-2.5 text-[14px] text-ink transition-colors duration-150 hover:border-ink-30 hover:bg-ink-06 active:bg-ink-12"
              >
                See the book&apos;s cold spots
              </Link>
            </div>
          </div>
          <footer className="border-t border-ink-08">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 font-mono text-[11px] text-ink-faint">
              <span>COLDSPOT · GenAI Open Agent Hackathon · Track 02</span>
              <span>Zetaris governed federation · NVIDIA Nemotron reasoning</span>
            </div>
          </footer>
        </section>
      </main>
    </>
  );
}
