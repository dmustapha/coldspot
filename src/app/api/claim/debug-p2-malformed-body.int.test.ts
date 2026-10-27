// File: src/app/api/claim/debug-p2-malformed-body.int.test.ts
// DEBUG Phase-2 regression (integration — needs the dev server on APP_URL, run via vitest.int).
// CERTIFICATION NIT (c): a malformed / empty request body is a CLIENT error (400), not a server
// fault (500). Debug found the defect on /api/claim/resolve AND its two sibling POST routes
// (/stream, /api/intent/route) — all three now guard req.json(). This pins the contract.
import { describe, it, expect } from "vitest";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";

const POST_ROUTES = [
  "/api/claim/resolve",
  "/api/claim/resolve/stream",
  "/api/intent/route",
];

async function postRaw(path: string, raw: string): Promise<number> {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  });
  return res.status;
}

describe("DEBUG P2 — malformed/empty body returns 400 (not 500) on every POST route", () => {
  for (const route of POST_ROUTES) {
    it(`${route} — non-JSON body -> 400`, async () => {
      expect(await postRaw(route, "this is not json{{{")).toBe(400);
    });
    it(`${route} — empty body -> 400`, async () => {
      expect(await postRaw(route, "")).toBe(400);
    });
  }
});
