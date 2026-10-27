// File: src/app/app/page.tsx  (/app — the operator's claim queue)
// Product surface: zero ambient decoration; richness = density + live state.
// The status strip answers "what is my state" before the queue answers "what needs me."
import { SiteNav } from "@/components/cold/Chrome";
import { ClaimQueue } from "@/components/ClaimQueue";

export default function AppQueue() {
  return (
    <>
      <SiteNav active="app" />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">operator console</p>
            <h1 className="display mt-2 text-[28px] text-ink">Claim queue</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-dim">
              Seeded claims from the carrier estate. Open one to run the investigation.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <ClaimQueue />
        </div>
      </main>
    </>
  );
}
