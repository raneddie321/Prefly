import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

function effortFromEnv(value: string | undefined, fallback: Effort): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : fallback;
}

/** Effort per agent. Coding quality matters most; design and art are lighter tasks. */
export const EFFORT = {
  design: effortFromEnv(process.env.PREFLY_DESIGN_EFFORT, "low"),
  graphics: effortFromEnv(process.env.PREFLY_GRAPHICS_EFFORT, "low"),
  code: effortFromEnv(process.env.PREFLY_CODE_EFFORT, "medium"),
};

/**
 * Server-side refusal fallback: if the model declines a request for policy
 * reasons, the API re-runs it on Anthropic's recommended fallback model.
 */
export function fallbackParams(): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } {
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: "refusal" | "truncated" | "format" | "api" = "api",
  ) {
    super(message);
  }
}
