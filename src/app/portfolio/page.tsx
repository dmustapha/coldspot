// File: src/app/portfolio/page.tsx  (/portfolio — the book-level "ongoing work" surface)
// Consumes GET /api/portfolio (the Meterless World Model projected over the real H-MEM ledger
// stream). Shows the book-level coverage state + systemic coverage-gap clusters (cold-spots) +
// per-claim coverage state (H-MEM across claims). Every number traces to a real ledger event.
import { SiteNav } from "@/components/cold/Chrome";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";

export default function PortfolioPage() {
  return (
    <>
      <SiteNav active="portfolio" />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">portfolio · ongoing work</p>
            <h1 className="display mt-2 text-[28px] text-ink">Book-level coverage state</h1>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-dim">
              The World Model folds the append-only Trust Ledger into a live book view: what
              reserved, what is held, and where several claims wait on the SAME missing fact.
              Every number is projected from real ledger events; nothing is synthesized.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <PortfolioDashboard />
        </div>
      </main>
    </>
  );
}
