// File: src/adapters/nemotron/tools.ts
// Function schemas the model can call during the 5-stage loop (Turn-1, tools-only).
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const agentTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "probe_source",
      description:
        "Probe a candidate source for relevance (schema/freshness/coverage). Returns a relevance score and a reason built from the probe signals.",
      parameters: {
        type: "object",
        properties: { source_id: { type: "string" } },
        required: ["source_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "federated_query",
      description:
        "Run ONE governed Zetaris query across the confirmed sources and return rows.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_image_facts",
      description:
        "Extract structured facts from an uploaded damage photo or repair invoice.",
      parameters: { type: "object", properties: {} },
    },
  },
];
