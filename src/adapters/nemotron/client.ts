// File: src/adapters/nemotron/client.ts
// Nemotron NIM client: tool-calling reasoning + SEPARATE vision extract.
// DT-3/D8 LOCKED: a single call NEVER carries both tools and response_format
// (combined is undocumented/buggy on NIM). This is enforced structurally below.
// INVARIANT #2: model id is substitution-LOCKED — never swap models.
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

// Substitution-LOCKED model id (INVARIANT #2). Env may override the transport
// (base URL / key) but the model literal stays in this file by design.
const MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  // Resilience bound (stress H-finding): the SDK default is a 600s per-request timeout with 2
  // internal retries, so a dead/hung NIM would hang ~20min before the resolve fails closed —
  // a demo-killing stall under the "reliable decisions under source outage" headline. Bound it:
  // 90s is comfortably above the 13-40s warm-reasoning ceiling but fails a truly-dead upstream
  // fast enough for the route-level transient-retry to degrade to an honest error, not a hang.
  timeout: Number(process.env.NEMOTRON_TIMEOUT_MS ?? 90_000),
  maxRetries: 1,
});

// Nemotron is a REASONING model: completions carry a non-standard reasoning_content.
type ReasoningMessage = OpenAI.Chat.Completions.ChatCompletionMessage & {
  reasoning_content?: string | null;
};

export interface ReasonResult {
  content: string | null;
  reasoningContent: string | null;
  toolCalls: ChatCompletionMessageToolCall[];
  finishReason: string | null;
  usage: OpenAI.Completions.CompletionUsage | undefined;
}

// Thrown when finish_reason:"length" fires — on this model that is a degenerate
// reasoning loop, NOT a budget shortfall. Raising max_tokens makes it WORSE, so we
// surface it rather than return garbage or silently retry bigger.
export class NemotronReasoningLoopError extends Error {
  readonly finishReason: string;
  readonly reasoningExcerpt: string;
  constructor(reasoningExcerpt: string) {
    super("NEMOTRON_REASONING_LOOP");
    this.name = "NEMOTRON_REASONING_LOOP";
    this.finishReason = "length";
    this.reasoningExcerpt = reasoningExcerpt;
  }
}

// Simple bounded backoff for the 40 RPM free tier (INVARIANT: loop is bounded).
async function withBackoff<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let delay = 1500;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 429 && i < tries - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw e;
    }
  }
  throw new Error("NEMOTRON_BACKOFF_EXHAUSTED");
}

// Reasoning turn. DT-3: ONE of { tools } OR { responseSchema } per call, never both.
//   Turn 1 (plan/probe): pass tools ONLY — tool_calls choose which sources to probe/federate.
//   Turn 2 (decide):     pass responseSchema ONLY — the decision JSON schema.
// tool_choice:"auto" (forced has a known NIM no-param bug). enable_thinking:false on the
// deterministic structured (Turn-2) path to save budget; Turn-1 keeps reasoning on.
export async function reason(args: {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  responseSchema?: { name: string; schema: Record<string, unknown> };
}): Promise<ReasonResult> {
  // D8 structural guard: a single API call must carry tools XOR response_format.
  if (args.tools && args.responseSchema) {
    throw new Error(
      "NEMOTRON_INVALID_TURN: a single reason() call cannot carry both tools and responseSchema (DT-3/D8). Split into a tool-planning turn then a structured decide turn.",
    );
  }

  const structured = Boolean(args.responseSchema);

  const res = await withBackoff(() =>
    client.chat.completions.create({
      model: MODEL,
      messages: args.messages,
      tools: args.tools,
      tool_choice: args.tools ? "auto" : undefined,
      response_format: args.responseSchema
        ? { type: "json_schema", json_schema: args.responseSchema }
        : undefined,
      max_tokens: 4096,
      // Deterministic structured (Turn-2) turns: disable reasoning to save budget.
      // chat_template_kwargs is a NIM extension passed through as an extra body field.
      ...(structured
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    }),
  );

  const choice = res.choices[0];
  const message = choice?.message as ReasoningMessage | undefined;
  const finishReason = choice?.finish_reason ?? null;
  const reasoningContent = message?.reasoning_content ?? null;

  // length == degenerate reasoning loop on this model → surface, don't return garbage.
  if (finishReason === "length") {
    const excerpt = (reasoningContent ?? message?.content ?? "").slice(0, 400);
    throw new NemotronReasoningLoopError(excerpt);
  }

  return {
    content: message?.content ?? null,
    reasoningContent,
    toolCalls: message?.tool_calls ?? [],
    finishReason,
    usage: res.usage,
  };
}

// Vision beat: SEPARATE call (D8 — never combined with tools). Base64 data URL is the
// documented image path; max_tokens 8192 for the vision budget.
export async function extractImageFacts(
  imageDataUrl: string,
  prompt: string,
): Promise<{
  damageType?: string;
  date?: string;
  amount?: number;
  confidence: number;
}> {
  const res = await withBackoff(() =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_facts",
          schema: {
            type: "object",
            properties: {
              damageType: { type: "string" },
              date: { type: "string" },
              amount: { type: "number" },
              confidence: { type: "number" },
            },
            required: ["confidence"],
          },
        },
      },
      max_tokens: 8192,
    }),
  );

  const choice = res.choices[0];
  if (choice?.finish_reason === "length") {
    const msg = choice.message as ReasoningMessage | undefined;
    throw new NemotronReasoningLoopError(
      (msg?.reasoning_content ?? msg?.content ?? "").slice(0, 400),
    );
  }

  const content = choice?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { confidence: 0 };
  }
}

// Internal: one VL extraction call with a caller-supplied prompt + json schema. Same proven
// image path as extractImageFacts (D8: image is a SEPARATE call, never combined with tools;
// base64 data URL; reasoning-loop guard on finish_reason:"length").
async function visionExtract<T>(
  imageDataUrl: string,
  prompt: string,
  schema: { name: string; schema: Record<string, unknown> },
  fallback: T,
): Promise<T> {
  const res = await withBackoff(() =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 8192,
    }),
  );
  const choice = res.choices[0];
  if (choice?.finish_reason === "length") {
    const msg = choice.message as ReasoningMessage | undefined;
    throw new NemotronReasoningLoopError(
      (msg?.reasoning_content ?? msg?.content ?? "").slice(0, 400),
    );
  }
  try {
    return JSON.parse(choice?.message?.content ?? "{}") as T;
  } catch {
    return fallback;
  }
}

// C1 vision wrapper: READ the CAT-event window off a FEMA/NOAA disaster-declaration image.
// The model extracts the declared incident period (open/close dates) + event name GENUINELY from
// the rendered declaration — never hardcoded. Dates returned as ISO (YYYY-MM-DD) when present.
export async function extractCatWindow(reportImg: string): Promise<{
  catWindowOpen?: string;
  catWindowClose?: string;
  catEventName?: string;
  confidence: number;
}> {
  const prompt =
    "This is a FEMA/NOAA disaster declaration document. Read it and extract the declared " +
    "incident period: the start date (catWindowOpen) and end date (catWindowClose) of the event, " +
    "and the event/storm name (catEventName). BOTH dates are printed on the declaration — you MUST " +
    "return catWindowOpen AND catWindowClose in ISO format YYYY-MM-DD exactly as printed. Set " +
    "confidence 0..1 for how clearly the dates were legible.";
  const schema = {
    name: "cat_window",
    schema: {
      type: "object",
      properties: {
        catWindowOpen: { type: "string" },
        catWindowClose: { type: "string" },
        catEventName: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["confidence"],
    },
  } as const;
  type CatWindow = {
    catWindowOpen?: string;
    catWindowClose?: string;
    catEventName?: string;
    confidence: number;
  };
  // Bounded re-ask (determinism robustness, MAJOR-1): the VL read occasionally drops a date field it
  // clearly read (returns only confidence/name). A missing close date flips the gate to abstain, so
  // if the dates are absent we re-read the SAME image ONCE. Never fabricates — a genuinely illegible
  // declaration still returns no dates on the second read and the gate honestly abstains.
  let out = await visionExtract<CatWindow>(reportImg, prompt, schema, { confidence: 0 });
  if (!out.catWindowClose || !out.catWindowOpen) {
    out = await visionExtract<CatWindow>(reportImg, prompt, schema, out);
  }
  return out;
}

// C1 vision wrapper: does the observed damage in a claim photo MATCH the claim's declared peril?
// (consistency check only — bounded; it never sets a coverage amount.)
export async function extractPerilMatch(
  photo: string,
  peril: string,
): Promise<{
  perilMatch: boolean;
  damageType?: string;
  confidence: number;
}> {
  return visionExtract(
    photo,
    `This is a property-damage claim photo. The claim's declared peril is "${peril}". ` +
      "Identify the visible damage type (damageType) and decide whether the observed damage is " +
      "consistent with that peril (perilMatch true/false). Set confidence 0..1.",
    {
      name: "peril_match",
      schema: {
        type: "object",
        properties: {
          perilMatch: { type: "boolean" },
          damageType: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["perilMatch", "confidence"],
      },
    },
    { perilMatch: false, confidence: 0 },
  );
}
