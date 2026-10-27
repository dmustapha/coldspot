// design-tests/tokens.design.test.ts
// Dreyth design-conformance tests: prove the SHIPPED code matches the formalized
// DESIGN_SYSTEM.md + brand.json. These assert the design was APPLIED, not just declared.
// Run standalone: npx vitest run --config design-tests/vitest.design.config.ts
// (kept OUT of the standing src tests suite so the 53/53 wall is untouched.)

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const globals = read("src/app/globals.css");
const tailwind = read("tailwind.config.ts");
const layout = read("src/app/layout.tsx");
const brand = JSON.parse(read("brand.json")) as Record<string, unknown>;
const designSystem = read("DESIGN_SYSTEM.md");

describe("COLDSPOT token derivation — brand.json matches globals.css", () => {
  it("accent is the shipped amber token", () => {
    const m = globals.match(/--accent:\s*(oklch\([^)]+\))/);
    expect(m?.[1]).toBe("oklch(78% 0.145 75)");
    expect(brand.accent).toBe(m?.[1]);
    expect(brand.brandColor).toBe(m?.[1]);
  });

  it("semantic colors map to the shipped jade/ice/garnet tokens", () => {
    const tok = (name: string) =>
      globals.match(new RegExp(`--${name}:\\s*(oklch\\([^)]+\\))`))?.[1];
    const sem = brand.semantic as Record<string, string>;
    expect(sem.success).toBe(tok("jade"));
    expect(sem.warning).toBe(tok("ice"));
    expect(sem.danger).toBe(tok("garnet"));
  });

  it("ink ladder endpoints are shipped surface/ink tokens", () => {
    const ink = brand.ink as string[];
    expect(ink[0]).toBe(globals.match(/--void:\s*(oklch\([^)]+\))/)?.[1]);
    expect(ink[4]).toBe(globals.match(/--ink:\s*(oklch\([^)]+\))/)?.[1]);
  });

  it("radii match tokenized tailwind borderRadius", () => {
    expect(tailwind).toMatch(/card:\s*"12px"/);
    expect(tailwind).toMatch(/chip:\s*"6px"/);
    const radii = brand.radii as Record<string, number>;
    expect(radii.md).toBe(12);
    expect(radii.sm).toBe(6);
  });
});

describe("COLDSPOT identity invariants", () => {
  it("is dark-only (register-ruled)", () => {
    expect(brand.colorMode).toBe("dark-only");
  });

  it("fonts are the three loaded faces", () => {
    expect(layout).toMatch(/Schibsted_Grotesk/);
    expect(layout).toMatch(/Public_Sans/);
    expect(layout).toMatch(/Spline_Sans_Mono/);
    const fonts = brand.fonts as Record<string, string>;
    expect(fonts.display).toBe("Schibsted Grotesk");
    expect(fonts.body).toBe("Public Sans");
    expect(fonts.mono).toBe("Spline Sans Mono");
  });

  it("shadow philosophy is pure-glow and no neutral in-flow shadow is declared", () => {
    expect(brand.shadowPhilosophy).toBe("pure-glow");
    // the only neutral shadow token is the overlay one
    const shadowTokens = globals.match(/--shadow-[a-z]+:/g) ?? [];
    expect(shadowTokens).toEqual(["--shadow-overlay:"]);
  });

  it("signatureObject is authored and thesis-derived (not a stamp)", () => {
    const sig = brand.signatureObject as { name: string; thesis: string; perSurface: Record<string, string> };
    expect(sig.name).toBe("cold-spot sweep");
    expect(sig.thesis.length).toBeGreaterThanOrEqual(12);
    // console identity must differ from landing
    expect(sig.perSurface.console).not.toBe(sig.perSurface.landing);
  });
});

describe("COLDSPOT color law (greppable, non-negotiable)", () => {
  it("globals.css bans glassmorphism (no backdrop-filter)", () => {
    expect(globals).not.toMatch(/backdrop-filter/);
  });

  it("ships no em-dash in token source or user-facing brand values", () => {
    // Law scope (DESIGN-HANDOFF 2): shipped strings + user-facing values. The
    // token stylesheet (comments included) and brand.json are both held to it;
    // DESIGN_SYSTEM.md is an internal contract doc, not a shipped string.
    expect(globals).not.toMatch(/—/);
    expect(JSON.stringify(brand)).not.toMatch(/—/);
  });

  it("status legend maps every semantic color to a state token", () => {
    const legend = brand.statusLegend as Array<{ color: string; token: string; meaning: string }>;
    expect(legend.length).toBeGreaterThanOrEqual(5);
    for (const row of legend) {
      expect(row.token.length).toBeGreaterThan(0);
      expect(row.meaning.length).toBeGreaterThan(0);
    }
    // ice row must mean "missing fact" (the thesis color law)
    const ice = legend.find((r) => r.token.includes("cold"));
    expect(ice?.meaning).toMatch(/missing/i);
  });

  it("DESIGN_SYSTEM.md carries all six formalized sections", () => {
    for (const h of ["## Identity", "## Tokens", "## Status Legend", "## Craft", "## Primitives", "## Motion"]) {
      expect(designSystem).toContain(h);
    }
  });

  it("invariant phrase is recorded in both the system doc and brand.json", () => {
    expect(brand.invariantPhrase).toBe("The one fact the lamp cannot warm.");
    expect(designSystem).toContain("The one fact the lamp cannot warm.");
  });
});
