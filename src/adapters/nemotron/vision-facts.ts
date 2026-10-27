// File: src/adapters/nemotron/vision-facts.ts
// C1 multi-read vision beat. Merges up to TWO genuine Nemotron VL reads into one VisionFacts:
//   - the DAMAGE PHOTO  -> damageType + perilMatch (consistency check; §4.3/D3)
//   - the FEMA REPORT   -> catWindowOpen/Close + catEventName (the HERO CAT-window fact)
// The FEMA-report read is what RESOLVES the hero's abstain->reserve: toCoverageFacts synthesizes
// the open-ended treaty window's close date from catWindowClose. Both reads are GENUINE model
// extractions (never hardcoded) — mutate either image and the facts change.
import { extractCatWindow, extractPerilMatch } from "./client";
import type { VisionFacts } from "@/core/types";

export interface VisionInputs {
  photoDataUrl?: string; // claim damage photo
  reportDataUrl?: string; // FEMA/NOAA declaration image
  peril?: string; // claim's declared peril (for the photo perilMatch read)
}

// Run whichever reads the inputs allow and merge them. Returns undefined when neither image is
// present (the orchestrator then skips the vision beat entirely).
export async function buildVisionFacts(
  inputs: VisionInputs,
): Promise<VisionFacts | undefined> {
  const { photoDataUrl, reportDataUrl, peril } = inputs;
  if (!photoDataUrl && !reportDataUrl) return undefined;

  const [photo, report] = await Promise.all([
    photoDataUrl
      ? extractPerilMatch(photoDataUrl, peril ?? "the declared peril")
      : Promise.resolve(undefined),
    reportDataUrl ? extractCatWindow(reportDataUrl) : Promise.resolve(undefined),
  ]);

  const merged: VisionFacts = {};
  if (photo) {
    merged.damageType = photo.damageType;
    merged.perilMatch = photo.perilMatch;
    merged.confidence = photo.confidence;
  }
  if (report) {
    merged.catWindowOpen = report.catWindowOpen;
    merged.catWindowClose = report.catWindowClose;
    merged.catEventName = report.catEventName;
    // The report read's confidence wins when a report was read (it carries the gate-resolving fact).
    merged.confidence = report.confidence;
  }
  return merged;
}
