// File: src/adapters/nemotron/nemotron.int.test.ts
// Integration tier (*.int.test.ts) — HITS THE LIVE NIM. Excluded from the offline tier.
// Run: `set -a && . ./.env.local && set +a && npm run test:int -- nemotron`
import { describe, it, expect } from "vitest";
import { reason, extractImageFacts, NemotronReasoningLoopError } from "./client";
import { agentTools } from "./tools";
import { decisionJsonSchema, decisionZ } from "@/core/decision-schema";

// A 1x1 transparent PNG — synthetic; vision output is nondeterministic so we assert
// SHAPE, not content.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Live NIM flakes (reasoning loop / 429) — retry a call up to 3x before failing.
async function retryLive<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e instanceof NemotronReasoningLoopError) {
        // eslint-disable-next-line no-console
        console.error(
          `[retry ${i + 1}/${tries}] NEMOTRON_REASONING_LOOP finish_reason=length reasoning="${e.reasoningExcerpt}"`,
        );
      }
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

describe("nemotron client (live NIM)", () => {
  it("reason() returns a tool_call for a probe prompt (tools only)", async () => {
    const res = await retryLive(() =>
      reason({
        messages: [
          {
            role: "system",
            content:
              "You are an insurance coverage agent. To gather facts you MUST call the provided tools. Do not answer in prose.",
          },
          {
            role: "user",
            content:
              "Claim C-1 on policy P-1 (fire loss). You have a candidate source 'oracle_policy'. Decide the next action by calling a tool.",
          },
        ],
        tools: agentTools,
      }),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[reason/tools] finish=${res.finishReason} usage=${JSON.stringify(res.usage)} toolCalls=${res.toolCalls
        .map((t) => t.function.name)
        .join(",")}`,
    );
    expect(res.toolCalls.length).toBeGreaterThan(0);
    const names = res.toolCalls.map((t) => t.function.name);
    expect(
      names.some((n) => n === "probe_source" || n === "federated_query"),
    ).toBe(true);
  });

  it("reason() with responseSchema (no tools) parses to a valid Decision", async () => {
    const res = await retryLive(() =>
      reason({
        messages: [
          {
            role: "system",
            content:
              "You output ONLY the coverage decision JSON per the schema. If a fact is missing, abstain and name the missing fact + resolving source.",
          },
          {
            role: "user",
            content:
              "Coverage facts: baseLimit=500000, endorsementSublimit=50000, endorsementPeril=fire, loss peril=fire. All facts present. Decide a reserve amount with a basis citing the facts.",
          },
        ],
        responseSchema: decisionJsonSchema,
      }),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[reason/schema] finish=${res.finishReason} usage=${JSON.stringify(res.usage)} content=${res.content}`,
    );
    expect(res.content).toBeTruthy();
    const parsed = decisionZ.safeParse(JSON.parse(res.content as string));
    expect(parsed.success).toBe(true);
  });

  it("extractImageFacts() returns {damageType,date,amount,confidence}", async () => {
    const facts = await retryLive(() =>
      extractImageFacts(
        TINY_PNG,
        "This is a property-damage photo for an insurance claim. Extract damageType, date (ISO), amount (USD), and your confidence (0..1). If unknown, still return confidence.",
      ),
    );
    // eslint-disable-next-line no-console
    console.log(`[vision] facts=${JSON.stringify(facts)}`);
    expect(facts).toBeTypeOf("object");
    expect(facts).toHaveProperty("confidence");
    expect(typeof facts.confidence).toBe("number");
  });

  it("reason() rejects a call carrying BOTH tools and responseSchema (D8 guard)", async () => {
    await expect(
      reason({
        messages: [{ role: "user", content: "x" }],
        tools: agentTools,
        responseSchema: decisionJsonSchema,
      }),
    ).rejects.toThrow(/NEMOTRON_INVALID_TURN/);
  });
});
