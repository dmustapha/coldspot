// File: scripts/gen-demo-assets.ts
// Render the two SEEDED-REAL C1 hero assets to coldspot/public/demo-assets/ as PNG:
//   1. fema-report-POL-1001.png  — a FEMA/NOAA disaster-declaration document that DECLARES the
//      CAT-event incident period (open 2026-09-10 .. close 2026-09-18). The hero loss 2026-09-14
//      falls INSIDE this window. The Nemotron VL model READS the close date off this image, which
//      synthesizes the open-ended treaty window (cat_event_close:null) into a complete window ->
//      the gate resolves -> reserve. The dates are rendered REAL text the model extracts; nothing
//      downstream is hardcoded (change the close date here and the verdict flips back to abstain).
//   2. damage-photo-CLM-4471.png — a fire-damage claim photo (the declared peril is "fire") so the
//      perilMatch consistency read has a real image to assess.
//
// "Seeded-real": the declaration renders the structure + real incident-period semantics of an
// OpenFEMA DisasterDeclarationsSummaries record (declarationType "DR", incidentType "Fire",
// incidentBeginDate/incidentEndDate). The LIVE OpenFEMA federation is C2; C1's hero fact is the
// GENUINE vision read of this declaration image.
//
// One-command runnable (no coldspot dep on playwright — uses the global install):
//   npx tsx scripts/gen-demo-assets.ts
import { mkdirSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Playwright + chromium live in the global homebrew install, not coldspot's node_modules — so it is
// required at runtime and typed with a minimal local shape (no local @types/playwright dependency).
const GLOBAL_PW = "/opt/homebrew/lib/node_modules/playwright";

interface PwPage {
  setContent(html: string, opts: { waitUntil: string }): Promise<void>;
  screenshot(opts: { path: string; type: "png" }): Promise<unknown>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(opts: { viewport: { width: number; height: number } }): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwChromium {
  launch(): Promise<PwBrowser>;
}
const { chromium } = require(GLOBAL_PW) as { chromium: PwChromium };

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(HERE, "../public/demo-assets");

// The FEMA declaration. Incident period CONTAINS the hero loss date (2026-09-14).
const CAT_OPEN = "2026-09-10";
const CAT_CLOSE = "2026-09-18";

const femaHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; font-family: "Times New Roman", Georgia, serif; }
  body { width:1000px; padding:56px 64px; background:#fdfdfb; color:#111; }
  .seal { text-align:center; margin-bottom:8px; }
  .seal .ring { display:inline-block; width:78px; height:78px; border:3px solid #0b2e63; border-radius:50%;
    line-height:72px; color:#0b2e63; font-weight:bold; font-size:13px; letter-spacing:.5px; }
  h1 { text-align:center; font-size:22px; color:#0b2e63; letter-spacing:1px; margin:10px 0 2px; }
  .sub { text-align:center; font-size:13px; color:#555; margin-bottom:20px; }
  hr { border:none; border-top:2px solid #0b2e63; margin:16px 0; }
  h2 { font-size:16px; color:#0b2e63; margin:18px 0 8px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  td { padding:7px 10px; border:1px solid #ccc; vertical-align:top; }
  td.k { background:#eef2f8; font-weight:bold; width:38%; color:#0b2e63; }
  .big { font-size:17px; font-weight:bold; }
  .note { font-size:12px; color:#555; margin-top:14px; line-height:1.5; }
  .ref { font-family: "Courier New", monospace; font-size:12px; color:#333; margin-top:18px; }
</style></head><body>
  <div class="seal"><span class="ring">FEMA<br/>DHS</span></div>
  <h1>FEDERAL EMERGENCY MANAGEMENT AGENCY</h1>
  <div class="sub">U.S. Department of Homeland Security · Disaster Declaration Summary</div>
  <hr/>
  <h2>Major Disaster Declaration — Incident Period of Record</h2>
  <table>
    <tr><td class="k">Disaster Number</td><td class="big">DR-4998-FL</td></tr>
    <tr><td class="k">Declaration Type</td><td>DR — Major Disaster Declaration</td></tr>
    <tr><td class="k">State / Region</td><td>Florida (FL) — Panhandle counties</td></tr>
    <tr><td class="k">Incident Type</td><td>Severe Wind &amp; Fire Event</td></tr>
    <tr><td class="k">Event Name</td><td class="big">FL Panhandle Wind-Fire Event (2026)</td></tr>
    <tr><td class="k">Incident Begin Date</td><td class="big">${CAT_OPEN}</td></tr>
    <tr><td class="k">Incident End Date</td><td class="big">${CAT_CLOSE}</td></tr>
    <tr><td class="k">Declaration Date</td><td>2026-09-20</td></tr>
  </table>
  <p class="note">
    This declaration establishes the official incident period of record for the referenced event.
    The incident period begins ${CAT_OPEN} and ends ${CAT_CLOSE}. Losses with a date of loss falling
    on or between these dates are within the declared catastrophe event window for coverage and
    reinsurance-cession purposes.
  </p>
  <div class="ref">Source: OpenFEMA DisasterDeclarationsSummaries · DR-4998-FL · NOAA NHC concurrence on file</div>
</body></html>`;

const damageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; font-family: Arial, sans-serif; }
  body { width:900px; height:600px; position:relative; overflow:hidden;
    background: linear-gradient(180deg,#2b2320 0%, #4a3b30 40%, #1a1512 100%); }
  .char { position:absolute; inset:0;
    background:
      radial-gradient(ellipse 300px 220px at 30% 70%, rgba(20,15,12,.9), transparent 70%),
      radial-gradient(ellipse 260px 180px at 68% 55%, rgba(40,25,18,.8), transparent 70%),
      repeating-linear-gradient(92deg, rgba(0,0,0,.35) 0 6px, rgba(30,20,15,.2) 6px 16px); }
  .beam { position:absolute; left:10%; right:10%; height:18px; background:#140f0c;
    box-shadow:0 2px 12px rgba(0,0,0,.6); transform:rotate(-3deg); }
  .b1 { top:40%; } .b2 { top:62%; transform:rotate(2deg); } .b3 { top:80%; left:30%; right:5%; }
  .smoke { position:absolute; top:0; left:0; right:0; height:45%;
    background: radial-gradient(ellipse 500px 200px at 50% 0%, rgba(90,80,75,.55), transparent 70%); }
  .ember { position:absolute; width:4px; height:4px; border-radius:50%; background:#ff7a2a; box-shadow:0 0 8px #ff5a1a; }
  .stamp { position:absolute; bottom:18px; left:18px; padding:8px 14px; background:rgba(0,0,0,.55);
    color:#eee; font-size:14px; letter-spacing:.5px; border-left:3px solid #ff5a1a; }
  .label { position:absolute; top:16px; right:16px; padding:6px 12px; background:rgba(0,0,0,.5);
    color:#ffb37a; font-size:13px; font-weight:bold; }
</style></head><body>
  <div class="char"></div>
  <div class="smoke"></div>
  <div class="beam b1"></div><div class="beam b2"></div><div class="beam b3"></div>
  <div class="ember" style="left:36%;top:50%"></div>
  <div class="ember" style="left:52%;top:44%"></div>
  <div class="ember" style="left:44%;top:58%"></div>
  <div class="ember" style="left:62%;top:52%"></div>
  <div class="label">FIRE DAMAGE</div>
  <div class="stamp">CLM-4471 · charred structural timber, soot deposition, collapsed roof beams</div>
</body></html>`;

async function render(
  browser: PwBrowser,
  html: string,
  file: string,
  size: { width: number; height: number },
): Promise<void> {
  const page = await browser.newPage({ viewport: size });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: resolvePath(OUT_DIR, file), type: "png" });
  await page.close();
  console.log(`  wrote demo-assets/${file}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    await render(browser, femaHtml, "fema-report-POL-1001.png", { width: 1000, height: 820 });
    await render(browser, damageHtml, "damage-photo-CLM-4471.png", { width: 900, height: 600 });
  } finally {
    await browser.close();
  }
  console.log(`CAT window declared in report: ${CAT_OPEN} .. ${CAT_CLOSE} (hero loss 2026-09-14 is INSIDE)`);
  console.log("assets written to public/demo-assets/");
}

main().catch((e) => {
  console.error("GEN_ASSETS_FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});
