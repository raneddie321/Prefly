import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AgentError, isAnthropicConfigured } from "@/lib/ai/client";
import { createGame, editGame, type PipelineResult } from "@/lib/ai/pipeline";
import { buildTemplateGame, demoEditMessage, demoMessage, pickTemplate } from "@/lib/templates";
import type { AssetMap, GameMode, GamePlan, GenerationEvent, Locale, Project, ProjectMessage, StageId } from "@/lib/types";

export const runtime = "nodejs";
// Vercel Hobby allows up to 300s; raise to 800 on Pro for long AI generations.
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().min(1).max(64),
  prompt: z.string().trim().max(4000).default(""),
  locale: z.enum(["en", "he"]).default("en"),
  image: z
    .object({
      mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
      data: z.string().max(7_000_000),
    })
    .optional(),
  runtimeErrors: z
    .array(
      z.object({
        kind: z.string().max(40),
        message: z.string().max(1000),
        line: z.number().int().optional(),
        col: z.number().int().optional(),
        stack: z.string().max(3000).optional(),
      }),
    )
    .max(20)
    .optional(),
  /** Project state sent by the browser when there's no database (projects live in localStorage). */
  local: z
    .object({
      html: z.string().max(2_000_000).nullable(),
      plan: z.any().nullable(),
      assets: z.record(z.string(), z.any()).default({}),
      mode: z.enum(["auto", "2d", "3d"]).default("auto"),
      multiplayer: z.boolean().default(false),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
    })
    .optional(),
});
type BodyT = z.infer<typeof Body>;

interface GenerationInput {
  intent: "create" | "edit" | "fix";
  prompt: string;
  locale: Locale;
  image?: BodyT["image"];
  runtimeErrors?: BodyT["runtimeErrors"];
  html: string | null;
  plan: GamePlan | null;
  assets: AssetMap;
  mode: GameMode;
  multiplayer: boolean;
  history: { role: "user" | "assistant"; content: string }[];
}

interface Persistence {
  save: (
    result: PipelineResult,
    intent: GenerationInput["intent"],
    agents: StageId[],
  ) => Promise<{ title?: string; emoji?: string; palette?: string[]; versionId: number | null }>;
  saveError: (message: string) => Promise<void>;
  remaining?: number;
  fallback: { title: string; emoji: string; palette: string[] };
}

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Invalid request" });
  const body = parsed.data;
  const isFix = Boolean(body.runtimeErrors?.length);
  if (!isFix && !body.prompt) return json(400, { error: "Describe what you want to build." });

  if (!isSupabaseConfigured()) {
    // No database: the browser keeps the project and sends its current state.
    if (!body.local) return json(400, { error: "Missing project state" });
    const l = body.local;
    return stream(
      {
        intent: !l.html ? "create" : isFix ? "fix" : "edit",
        prompt: body.prompt,
        locale: body.locale,
        image: body.image,
        runtimeErrors: body.runtimeErrors,
        html: l.html,
        plan: (l.plan as GamePlan | null) ?? null,
        assets: l.assets as AssetMap,
        mode: l.mode,
        multiplayer: l.multiplayer,
        history: l.history,
      },
      {
        save: async (result, intent) => {
          const plan = intent === "create" ? result.plan : null;
          return { title: plan?.title, emoji: plan?.emoji, palette: plan?.palette, versionId: null };
        },
        saveError: async () => undefined,
        fallback: { title: "", emoji: "🎮", palette: ["#6d5dfc", "#a78bfa"] },
      },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Please sign in.", code: "auth" });

  const { data: project } = await supabase.from("projects").select("*").eq("id", body.projectId).single<Project>();
  if (!project || project.user_id !== user.id) return json(404, { error: "Game not found." });

  const intent = !project.html ? "create" : isFix ? "fix" : "edit";
  const { data: quota } = await supabase.rpc("consume_generation", { p_kind: intent });
  const q = quota as { ok: boolean; reason?: string; limit?: number; anonymous?: boolean; remaining?: number } | null;
  if (!q?.ok) {
    return json(429, {
      error: q?.anonymous
        ? `You've used today's ${q.limit} free guest generations. Create an account to keep building.`
        : `Daily limit reached (${q?.limit ?? "?"} generations). Try again tomorrow.`,
      code: "quota",
    });
  }

  const { data: historyRows } = await supabase
    .from("project_messages")
    .select("role,content,meta")
    .eq("project_id", project.id)
    .order("id", { ascending: false })
    .limit(12);
  const history = ((historyRows ?? []) as Pick<ProjectMessage, "role" | "content" | "meta">[])
    .reverse()
    .filter((m) => m.meta?.kind !== "error")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  await supabase.from("project_messages").insert({
    project_id: project.id,
    role: "user",
    content: isFix ? `Fix ${body.runtimeErrors!.length} error(s) found while play-testing` : body.prompt,
    meta: isFix ? { kind: "fix" } : body.image ? { image: true } : {},
  });

  return stream(
    {
      intent,
      prompt: body.prompt,
      locale: body.locale,
      image: body.image,
      runtimeErrors: body.runtimeErrors,
      html: project.html,
      plan: project.plan,
      assets: project.assets ?? {},
      mode: project.mode,
      multiplayer: project.multiplayer,
      history,
    },
    {
      remaining: q.remaining,
      fallback: { title: project.title, emoji: project.emoji, palette: project.palette },
      save: async (result, kind, agents) => {
        const plan = result.plan;
        const update: Partial<Project> = { html: result.html, assets: result.assets, plan };
        if (kind === "create" && plan) {
          Object.assign(update, {
            title: plan.title,
            description: plan.tagline,
            emoji: plan.emoji,
            palette: plan.palette,
            multiplayer: plan.multiplayer,
          });
        }
        const { error: updateError } = await supabase.from("projects").update(update).eq("id", project.id);
        if (updateError) throw new Error(updateError.message);
        const { data: version } = await supabase
          .from("project_versions")
          .insert({ project_id: project.id, html: result.html, assets: result.assets, summary: result.message.slice(0, 300) || kind })
          .select("id")
          .single<{ id: number }>();
        await supabase.from("project_messages").insert({
          project_id: project.id,
          role: "assistant",
          content: result.message || "Done.",
          meta: { kind: kind === "fix" ? "fix" : undefined, issues: result.remainingIssues, agents },
        });
        return { title: update.title, emoji: update.emoji, palette: update.palette, versionId: version?.id ?? null };
      },
      saveError: async (message) => {
        await supabase.from("project_messages").insert({ project_id: project.id, role: "assistant", content: message, meta: { kind: "error" } });
      },
    },
  );
}

/** Without an Anthropic key: new projects get a built-in game; edits get an explanation. */
async function runDemo(input: GenerationInput, emit: (e: GenerationEvent) => void): Promise<PipelineResult> {
  if (input.intent !== "create") {
    return { html: input.html ?? "", assets: input.assets, plan: input.plan, message: demoEditMessage(input.locale), remainingIssues: 0 };
  }
  const id = pickTemplate(input.prompt, input.mode);
  const { html, plan } = buildTemplateGame(id, input.locale);
  const message = demoMessage(id, input.locale);
  emit({ type: "stage", stage: "design", status: "start" });
  emit({ type: "plan", plan });
  emit({ type: "stage", stage: "design", status: "done", detail: plan.title });
  emit({ type: "stage", stage: "code", status: "start" });
  emit({ type: "delta", text: `<message>\n${message}\n</message>\n` });
  emit({ type: "stage", stage: "code", status: "done" });
  return { html, assets: {}, plan, message, remainingIssues: 0 };
}

function stream(input: GenerationInput, persistence: Persistence): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const agents: StageId[] = [];
      const emit = (event: GenerationEvent) => {
        if (event.type === "stage" && event.status === "done" && !agents.includes(event.stage) && event.stage !== "save") agents.push(event.stage);
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true; // client went away — keep working so the result is still saved
        }
      };
      // Keep proxies from closing an idle connection while the model thinks.
      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      try {
        let result: PipelineResult;
        if (!isAnthropicConfigured()) {
          result = await runDemo(input, emit);
        } else if (input.intent === "create") {
          result = await createGame({
            prompt: input.prompt,
            mode: input.mode,
            multiplayer: input.multiplayer,
            locale: input.locale,
            image: input.image,
            emit,
          });
        } else {
          result = await editGame({
            ctx: { html: input.html ?? "", plan: input.plan, assets: input.assets, history: input.history },
            instruction: input.prompt,
            runtimeErrors: input.runtimeErrors,
            locale: input.locale,
            image: input.image,
            emit,
          });
        }

        emit({ type: "stage", stage: "save", status: "start" });
        const saved = await persistence.save(result, input.intent, agents);
        emit({ type: "stage", stage: "save", status: "done" });
        emit({
          type: "done",
          html: result.html,
          assets: result.assets,
          message: result.message,
          title: saved.title ?? persistence.fallback.title,
          emoji: saved.emoji ?? persistence.fallback.emoji,
          palette: saved.palette ?? persistence.fallback.palette,
          versionId: saved.versionId,
          remaining: persistence.remaining,
        });
      } catch (err) {
        console.error("generation failed", err);
        const message = errorMessage(err);
        await persistence.saveError(message).catch(() => undefined);
        emit({ type: "error", message, code: err instanceof AgentError ? err.code : "api" });
      } finally {
        clearInterval(keepAlive);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof AgentError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The server's Anthropic API key is invalid.";
  if (err instanceof Anthropic.BadRequestError) return `The AI request was rejected: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Please try again.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? "network"}). Please try again.`;
  return "Something went wrong while building your game. Please try again.";
}
