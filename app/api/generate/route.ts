import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AgentError, isAnthropicConfigured } from "@/lib/ai/client";
import { createGame, editGame, type PipelineResult } from "@/lib/ai/pipeline";
import type { GenerationEvent, Project, ProjectMessage, StageId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 800;

const Body = z.object({
  projectId: z.string().uuid(),
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
});

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json(500, { error: "Supabase is not configured on the server.", code: "config" });
  if (!isAnthropicConfigured()) return json(500, { error: "ANTHROPIC_API_KEY is not configured on the server.", code: "config" });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Invalid request" });
  const body = parsed.data;
  const isFix = Boolean(body.runtimeErrors?.length);
  if (!isFix && !body.prompt) return json(400, { error: "Describe what you want to build." });

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

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
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
        if (intent === "create") {
          result = await createGame({
            prompt: body.prompt,
            mode: project.mode,
            multiplayer: project.multiplayer,
            locale: body.locale,
            image: body.image,
            emit,
          });
        } else {
          result = await editGame({
            ctx: { html: project.html!, plan: project.plan, assets: project.assets ?? {}, history },
            instruction: body.prompt,
            runtimeErrors: body.runtimeErrors,
            locale: body.locale,
            image: body.image,
            emit,
          });
        }

        emit({ type: "stage", stage: "save", status: "start" });
        const plan = result.plan;
        const update: Partial<Project> = { html: result.html, assets: result.assets, plan };
        if (intent === "create" && plan) {
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
          .insert({ project_id: project.id, html: result.html, assets: result.assets, summary: result.message.slice(0, 300) || intent })
          .select("id")
          .single<{ id: number }>();
        await supabase.from("project_messages").insert({
          project_id: project.id,
          role: "assistant",
          content: result.message || "Done.",
          meta: { kind: intent === "fix" ? "fix" : undefined, issues: result.remainingIssues, agents },
        });
        emit({ type: "stage", stage: "save", status: "done" });

        emit({
          type: "done",
          html: result.html,
          assets: result.assets,
          message: result.message,
          title: update.title ?? project.title,
          emoji: update.emoji ?? project.emoji,
          palette: update.palette ?? project.palette,
          versionId: version?.id ?? null,
          remaining: q.remaining,
        });
      } catch (err) {
        console.error("generation failed", err);
        const message = errorMessage(err);
        await supabase
          .from("project_messages")
          .insert({ project_id: project.id, role: "assistant", content: message, meta: { kind: "error" } });
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

  return new Response(stream, {
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
