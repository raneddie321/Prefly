/**
 * Plans and AI models. Shared by the server (enforcement) and the UI.
 * Daily generation limits are enforced in the database (consume_generation);
 * keep the numbers here in sync with supabase/migrations/0002_plans_and_files.sql.
 */

export type PlanId = "guest" | "free" | "pro";
export type ModelKey = "fast" | "balanced" | "pro" | "ultra";

export interface ModelInfo {
  key: ModelKey;
  /** Anthropic model id. */
  api: string;
  name: string;
  description: { en: string; he: string };
  /** Lowest plan that can use it. */
  plan: PlanId;
  /** Whether the model supports server-side refusal fallback. */
  fallback: boolean;
  speed: 1 | 2 | 3;
  quality: 1 | 2 | 3 | 4;
}

export const MODELS: Record<ModelKey, ModelInfo> = {
  fast: {
    key: "fast",
    api: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    description: { en: "Fastest — great for quick ideas", he: "הכי מהיר — מעולה לרעיונות מהירים" },
    plan: "guest",
    fallback: false,
    speed: 3,
    quality: 1,
  },
  balanced: {
    key: "balanced",
    api: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: { en: "Balanced speed and quality", he: "איזון בין מהירות לאיכות" },
    plan: "free",
    fallback: true,
    speed: 2,
    quality: 2,
  },
  pro: {
    key: "pro",
    api: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: { en: "Bigger, more polished games", he: "משחקים גדולים ומלוטשים יותר" },
    plan: "pro",
    fallback: true,
    speed: 2,
    quality: 3,
  },
  ultra: {
    key: "ultra",
    api: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    description: { en: "Most capable — for ambitious games", he: "החזק ביותר — למשחקים שאפתניים" },
    plan: "pro",
    fallback: true,
    speed: 1,
    quality: 4,
  },
};

export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[];

const RANK: Record<PlanId, number> = { guest: 0, free: 1, pro: 2 };

export function canUseModel(plan: PlanId, model: ModelKey): boolean {
  return RANK[plan] >= RANK[MODELS[model].plan];
}

export function defaultModel(plan: PlanId): ModelKey {
  return plan === "pro" ? "pro" : plan === "free" ? "balanced" : "fast";
}

export const PLAN_LIMITS: Record<PlanId, { daily: number; versions: number; sourceDownload: boolean; appDownload: boolean }> = {
  guest: { daily: 5, versions: 10, sourceDownload: false, appDownload: false },
  free: { daily: 25, versions: 30, sourceDownload: false, appDownload: true },
  pro: { daily: 300, versions: 200, sourceDownload: true, appDownload: true },
};

export function isModelKey(value: unknown): value is ModelKey {
  return typeof value === "string" && value in MODELS;
}
