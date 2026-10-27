// File: src/app/demo/page.tsx  (/demo — the Trust Ledger, the money-moment surface)
// One decision, fully opened. First glance: the ABSTAIN engine over the real
// CLM-4471 run. Second: the ledger, every step on the record. Third: the lineage
// graph. The replay is PRE-RUN (committed ledger), so this lands with no setup.
import Link from "next/link";
import { SiteNav, ProvChip } from "@/components/cold/Chrome";
import { ClaimThermogram } from "@/components/ClaimThermogram";
import { TrustLedgerTimeline } from "@/components/TrustLedgerTimeline";
import { EvidenceGraph } from "@/components/EvidenceGraph";

const HERO = "CLM-4471";

export default function Demo() {
  return (
    <>
      <SiteNav active="demo" />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-start">
          <div>
            <p className="eyebrow">judge replay · no setup</p>
            <h1 className="display mt-3 text-[clamp(1.8rem,3vw,2.5rem)] text-ink">
              The decision it <span className="text-ice">refused</span>,
              <br />
              <span className="text-ink-45">and the record to defend it.</span>
            </h1>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-dim">
              A real agent run over real federated Zetaris sources, replayed from the
              append-only Trust Ledger. COLDSPOT discards an irrelevant legacy source
              with a written reason, federates three governed sources in place, and
              abstains: the loss date&apos;s position inside the declared CAT event
              window is the one fact it cannot prove.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ProvChip>claim {HERO}</ProvChip>
              <ProvChip>append-only ledger</ProvChip>
              <ProvChip>governed Zetaris JOIN</ProvChip>
            </div>
            <Link
              href={`/app/claim/${HERO}`}
              className="mt-6 inline-block rounded-chip border border-ink-18 px-4 py-2 text-[13.5px] text-ink transition-colors duration-150 hover:border-ink-30 hover:bg-ink-06 active:bg-ink-12"
            >
              Open the live resolution surface
            </Link>
          </div>
          <ClaimThermogram
            claimId={HERO}
            run="latest-abstain"
            footnote={
              <p className="mt-3 border-t border-ink-08 pt-3 font-mono text-[11.5px] leading-relaxed text-ink-dim">
                <span className="text-jade">causality proven:</span> re-run with the FEMA
                declaration, the same claim flips to reserve $750,000. The artifact is on{" "}
                <Link href="/proof" className="text-accent underline-offset-2 hover:underline">
                  the proof surface
                </Link>
                .
              </p>
            }
          />
        </div>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[19px] font-700 text-ink" style={{ fontWeight: 700 }}>
              Trust Ledger
            </h2>
            <span className="font-mono text-[11px] text-ink-faint">
              what it used, and what it refused
            </span>
          </div>
          <div className="mt-3">
            <TrustLedgerTimeline claimId={HERO} run="latest-abstain" />
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[19px] font-700 text-ink" style={{ fontWeight: 700 }}>
              Evidence graph · lineage
            </h2>
            <span className="font-mono text-[11px] text-ink-faint">
              click a sentence; its provenance chain lights
            </span>
          </div>
          <div className="mt-3">
            <EvidenceGraph claimId={HERO} run="latest-abstain" />
          </div>
        </section>
      </main>
    </>
  );
}
