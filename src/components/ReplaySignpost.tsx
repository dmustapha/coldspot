// File: src/components/ReplaySignpost.tsx
// Shown in place of a live-mutation control when the hosted demo runs in replay mode (the micro is
// app-only, so a live resolve there would fail closed). A judge clicking any live control sees this
// explanatory panel, never a raw 5xx — and is pointed at the earned /demo replay where the money
// beat (abstain -> vision -> reserve) plays exactly as it was recorded.
import Link from "next/link";

export function ReplaySignpost({ action }: { action: string }) {
  return (
    <div className="rounded-card border border-dashed border-ice-45 bg-ice-10 p-4">
      <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ice">
        Replay deployment
      </p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-dim">
        {action} runs the live federation stack (Zetaris + Oracle + Nemotron), which is not hosted on
        this demo instance. This instance serves the earned, recorded run with full lineage. Watch the
        money beat on the judge replay: the agent abstains, then vision closes the gap into a reserve.
      </p>
      <Link
        href="/demo"
        className="mt-3 inline-flex rounded-chip bg-accent px-4 py-1.5 text-[13px] font-semibold text-[oklch(18%_0.02_75)] transition-colors duration-150 hover:bg-accent-hi active:bg-accent-deep"
      >
        Open the judge replay
      </Link>
    </div>
  );
}
