// File: src/app/proof/page.tsx  (/proof — the recompute/verification surface)
// Every card on this page renders values READ FROM THE COMMITTED ARTIFACTS at
// render time (evidence/*.json + the append-only ledger), never hardcoded and
// never read back from a cached UI state. If an artifact is missing, the card
// degrades to a designed mismatch state instead of pretending.
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { SiteNav, ProvChip } from "@/components/cold/Chrome";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

function readArtifact(rel: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as Json;
  } catch {
    return null;
  }
}

function countLedger(rel: string): number | null {
  try {
    const txt = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    return txt.split("\n").filter(Boolean).length;
  } catch {
    return null;
  }
}

function Pill({ pass }: { pass: boolean | null }) {
  if (pass === null)
    return (
      <span className="rounded-chip border border-dashed border-ink-18 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-faint">
        ARTIFACT MISSING
      </span>
    );
  return pass ? (
    <span className="rounded-chip border border-jade-25 bg-jade-12 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-jade">
      PASS
    </span>
  ) : (
    <span className="rounded-chip border border-garnet-25 bg-garnet-12 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-garnet">
      FAIL
    </span>
  );
}

function Card({
  title,
  file,
  pass,
  children,
}: {
  title: string;
  file: string;
  pass: boolean | null;
  children: React.ReactNode;
}) {
  return (
    <div className={`card p-5 ${pass === false ? "border-garnet-25" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-700 text-ink" style={{ fontWeight: 700 }}>
          {title}
        </h2>
        <Pill pass={pass} />
      </div>
      <div className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-ink-dim">{children}</div>
      <p className="mono-data mt-4 border-t border-ink-08 pt-2.5 text-[11px] text-ink-faint">{file}</p>
    </div>
  );
}

const Row = ({ k, v, tone }: { k: string; v: string; tone?: "jade" | "ice" | "accent" }) => (
  <p className="flex items-baseline justify-between gap-4">
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">{k}</span>
    <span
      className={`mono-data text-right text-[12.5px] ${
        tone === "jade" ? "text-jade" : tone === "ice" ? "text-ice" : tone === "accent" ? "text-accent" : "text-ink"
      }`}
    >
      {v}
    </span>
  </p>
);

export default function Proof() {
  const c1 = readArtifact("evidence/c1-causality-eval.json");
  const c2 = readArtifact("evidence/c2-reasoning-eval.json");
  const c3 = readArtifact("evidence/c3-discovery-eval.json");
  const c4 = readArtifact("evidence/c4-recompute-eval.json");
  const scout = readArtifact("evidence/scout-eval.json");
  const ledgerLines = countLedger("evidence/ledger/ledger.jsonl");

  const c1w = (c1?.without ?? null) as Json | null;
  const c1r = (c1?.withReport ?? null) as Json | null;
  const c1s = (c1?.streamIntegrity ?? null) as Json | null;
  const c2agree = Array.isArray(c2?.verifyAgreement) ? (c2!.verifyAgreement as Json[]) : null;
  const c2cf = Array.isArray(c2?.counterfactual) ? (c2!.counterfactual as Json[]) : null;

  return (
    <>
      <SiteNav active="proof" />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex items-center gap-3">
          <p className="eyebrow">proof &amp; artifacts</p>
          <span className="inline-flex gap-[3px]" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="h-[8px] w-[8px] rounded-[2px] bg-accent"
                style={{ opacity: 0.4 + ((i * 3) % 4) * 0.15 }}
              />
            ))}
          </span>
        </div>
        <h1 className="display mt-2 text-[28px] text-ink">
          Re-derived in front of you.
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-dim">
          The values below are read from the committed evaluation artifacts at render
          time. The law: every headline number recomputes from seed; a number that
          cannot re-derive shows as a failure here, not a claim elsewhere.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ProvChip>
            append-only ledger · {ledgerLines != null ? `${ledgerLines} entries` : "unreadable"}
          </ProvChip>
          <ProvChip>evidence/*.json · committed</ProvChip>
          <ProvChip degraded={ledgerLines == null}>read at render, never cached</ProvChip>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2">
          <Card
            title="Causality: the missing fact flips the verdict"
            file="evidence/c1-causality-eval.json"
            pass={c1 ? c1.verdict === "PASS" : null}
          >
            {c1 ? (
              <>
                <Row k="without the report" v={String(c1w?.verdict ?? "·")} tone="ice" />
                <Row
                  k="names the CAT fact"
                  v={c1w?.namesCatFact ? "yes, verbatim" : "no"}
                />
                <Row
                  k="with the report"
                  v={`${String(c1r?.verdict ?? "·")} $${Number(c1r?.amount ?? 0).toLocaleString()}`}
                  tone="jade"
                />
                <Row
                  k="stream integrity"
                  v={`${Number((c1s as Json)?.matched ?? 0)} steps reconstruct the ledger tail`}
                  tone="accent"
                />
              </>
            ) : (
              <p className="font-mono text-[12px] text-ink-faint">
                Run the C1 harness to produce this artifact.
              </p>
            )}
          </Card>

          <Card
            title="Reasoning: verify agrees, counterfactual recomputes"
            file="evidence/c2-reasoning-eval.json"
            pass={c2 ? Boolean(c2.verifyAllAgree) : null}
          >
            {c2 ? (
              <>
                <Row
                  k="verify agreement"
                  v={`${c2agree?.filter((a) => a.agrees).length ?? 0}/${c2agree?.length ?? 0} claims agree`}
                  tone="jade"
                />
                {c2cf?.map((cf) => (
                  <Row
                    key={String(cf.claim)}
                    k={`counterfactual ${String(cf.claim)}`}
                    v={`ledger $${Number(cf.ledgerAmount).toLocaleString()} = recomputed $${Number(cf.recomputed).toLocaleString()}`}
                    tone={cf.matches ? "jade" : undefined}
                  />
                ))}
              </>
            ) : (
              <p className="font-mono text-[12px] text-ink-faint">
                Run the C2 harness to produce this artifact.
              </p>
            )}
          </Card>

          <Card
            title="Discovery: earned, decoys refused in writing"
            file="evidence/c3-discovery-eval.json"
            pass={c3 ? c3.verdict === "PASS" : null}
          >
            {c3 ? (
              <>
                <Row
                  k="source types probed"
                  v={`${Number(c3.typesProbed)}/${Number(c3.catalogTypes)}`}
                  tone="accent"
                />
                <Row k="decoy discarded" v={c3.decoyDiscarded ? "yes" : "no"} />
                <Row
                  k="reason signal-derived"
                  v={c3.decoyReasonSignalDerived ? "yes" : "no"}
                />
                {typeof c3.decoyReason === "string" && (
                  <p className="mono-data mt-1 rounded-chip border border-ink-08 bg-[oklch(13.5%_0.012_232)] px-2.5 py-1.5 text-[11px] text-ink-dim">
                    {c3.decoyReason}
                  </p>
                )}
              </>
            ) : (
              <p className="font-mono text-[12px] text-ink-faint">
                Run the C3 harness to produce this artifact.
              </p>
            )}
          </Card>

          <Card
            title="Recompute: stored decisions re-derive from live sources"
            file="evidence/c4-recompute-eval.json"
            pass={c4 ? c4.verdict === "PASS" || Boolean(c4.pass) : null}
          >
            {c4 ? (
              <>
                {Object.entries(c4)
                  .filter(([k, v]) => ["verdict", "ts", "harness"].indexOf(k) === -1 && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <Row key={k} k={k} v={String(v)} />
                  ))}
                <p className="mt-1 text-[12.5px]">
                  Try it live:{" "}
                  <Link href="/app/claim/CLM-4471" className="text-accent underline-offset-2 hover:underline">
                    re-derive CLM-4471 on the resolution surface
                  </Link>
                </p>
              </>
            ) : (
              <p className="font-mono text-[12px] text-ink-faint">
                Run the C4 harness to produce this artifact.
              </p>
            )}
          </Card>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Card
            title="Scout routing eval"
            file="evidence/scout-eval.json"
            pass={scout ? scout.verdict === "PASS" || Boolean(scout.pass) : null}
          >
            {scout ? (
              Object.entries(scout)
                .filter(([k, v]) => ["verdict", "ts"].indexOf(k) === -1 && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
                .slice(0, 5)
                .map(([k, v]) => <Row key={k} k={k} v={String(v)} />)
            ) : (
              <p className="font-mono text-[12px] text-ink-faint">
                Run the Scout eval to produce this artifact.
              </p>
            )}
          </Card>

          <Card title="The Trust Ledger itself" file="evidence/ledger/ledger.jsonl" pass={ledgerLines != null}>
            <Row k="entries on record" v={ledgerLines != null ? String(ledgerLines) : "unreadable"} tone="accent" />
            <p className="text-[12.5px]">
              Append-only. Every probe, discard, federate, reconcile, counterfactual,
              verify, and refusal, in order.{" "}
              <Link href="/api/ledger/CLM-4471" className="text-accent underline-offset-2 hover:underline">
                Replay the hero claim&apos;s entries as JSON
              </Link>
              .
            </p>
          </Card>
        </div>
      </main>
    </>
  );
}
