// File: src/components/SourceTiles.tsx
// The candidate sources the agent probed. The DISCARDED tile (legacy_notes decoy),
// carrying its signal-derived discard reason, is the provenance differentiator:
// discovery is earned, not a hardcoded relevant-list (INVARIANT #3).
// Identity: kept = lamp-amber heat; refused = struck, cooled; the reason is the ornament.
"use client";

export type TileStatus = "relevant" | "discarded" | "unavailable" | "pending";

export interface Tile {
  sourceId: string;
  label: string;
  status: TileStatus;
  reason?: string;
  score?: number;
}

const STYLES: Record<TileStatus, { box: string; badge: string; text: string }> = {
  relevant: {
    box: "border-accent-30 bg-accent-08",
    badge: "border border-accent-30 bg-accent-12 text-accent-hi",
    text: "USED",
  },
  discarded: {
    box: "border-ink-12 bg-surface-1",
    badge: "border border-ink-12 bg-ink-06 text-ink-dim",
    text: "REFUSED",
  },
  unavailable: {
    box: "border-dashed border-ice-45 bg-ice-10",
    badge: "border border-dashed border-ice-45 text-ice",
    text: "UNAVAILABLE",
  },
  pending: {
    box: "border-ink-08 bg-surface-1",
    badge: "border border-ink-08 text-ink-faint",
    text: "PENDING",
  },
};

export function SourceTiles({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) {
    // Branded empty state: an unswept rail, all cells dark, beam idling.
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-24 items-center justify-center rounded-card border border-dashed border-ink-12 bg-[oklch(14%_0.014_230)]"
          >
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
              unswept
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => {
        const s = STYLES[t.status];
        const refused = t.status === "discarded";
        return (
          <div
            key={t.sourceId}
            className={`rounded-card border p-3 transition-colors duration-150 ${s.box}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`text-[13.5px] font-medium ${refused ? "text-ink-dim line-through decoration-ink-30" : "text-ink"}`}
              >
                {t.label}
              </span>
              <span
                className={`shrink-0 rounded-chip px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] ${s.badge}`}
              >
                {s.text}
              </span>
            </div>
            <div className="mono-data mt-1 text-[11px] text-ink-faint">
              {t.sourceId}
              {typeof t.score === "number" && (
                <span className="ml-1">· score {t.score.toFixed(2)}</span>
              )}
            </div>
            {refused && t.reason && (
              <p className="mt-2 border-t border-ink-08 pt-2 font-mono text-[11px] leading-relaxed text-ink-dim">
                <span className="text-ink-faint">refused: </span>
                {t.reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
