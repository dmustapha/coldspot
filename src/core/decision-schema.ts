// File: src/core/decision-schema.ts
import { z } from "zod";

// JSON schema handed to Nemotron response_format. The abstain branch REQUIRES
// missing_fact + resolving_source (INVARIANT #4, structurally enforced).
export const decisionJsonSchema = {
  name: "coverage_decision",
  schema: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          verdict: { const: "reserve" },
          amount: { type: "number" },
          currency: { const: "USD" },
          basis: { type: "string", minLength: 10 },
        },
        required: ["verdict", "amount", "currency", "basis"],
      },
      {
        type: "object",
        properties: {
          verdict: { const: "abstain" },
          missing_fact: { type: "string", minLength: 8 },
          resolving_source: { type: "string", minLength: 3 },
          partial_basis: { type: "string" },
        },
        required: ["verdict", "missing_fact", "resolving_source", "partial_basis"],
      },
    ],
  },
} as const;

// Runtime guard: reject an abstain lacking a named fact; re-prompt or BLOCK.
export const reserveZ = z.object({
  verdict: z.literal("reserve"),
  amount: z.number(),
  currency: z.literal("USD"),
  basis: z.string().min(10),
});
export const abstainZ = z.object({
  verdict: z.literal("abstain"),
  missing_fact: z.string().min(8),
  resolving_source: z.string().min(3),
  partial_basis: z.string(),
});
export const decisionZ = z.union([reserveZ, abstainZ]);
