import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AgentError, isAnthropicConfigured } from "@/lib/ai/client";
import { build, projectFiles, stepCode, stepDesign, stepGraphics, stepRepair, type CodeResult } from "@/lib/ai/pipeline";
import { buildTemplateGame, demoEditMessage, demoMessage, pickTemplate, TEMPLATES, type TemplateId } from "@/lib/templates";
import { canUseModel, defaultModel, isModelKey, MODELS, PLAN_LIMITS, type ModelKey, type PlanId } from "@/lib/plans";
import type { AssetMap, GameMode, GamePlan, GenerationEvent, GenerationStep, Locale, Project, ProjectMessage, StageId } from "@/lib/types";

export const runtime = "nodejs";
// Vercel Hobby allows up to 300s; each pipeline step is its own request, so steps fit comfortably.
export const maxDuration = 300;

const FileMapSchema = z.record(z.string().max(160), z.string().max(400_000));

const Body = z.object({
  projectId: z.string().min(1).max(64),
  step: z.enum(["design", "graphics", "code", "repair"]),
  prompt: z.string().trim().max(4000).default(""),
  locale: z.enum(["en", "he"]).default("en"),
  model: z.string().max(20).optional(),
  agents: z.array(z.string().max(20)).max(10).optional(),
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
        file: z.string().max(160).optional(),
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
      files: FileMapSchema.nullable().optional(),
      html: z.string().max(3_000_000).nullable(),
      plan: z.any().nullable(),
      assets: z.record(z.string(), z.any()).default({}),
      mode: z.enum(["auto", "2d", "3d"]).default("auto"),
      multiplayer: z.boolean().default(false),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
    })
    .optional(),
});
type BodyT = z.infer<typeof Body>;

/** Everything a step needs about the project, wherever it is stored. */
interface ProjectState {
  files: Record<string, string>;
  plan: GamePlan | null;
  assets: AssetMap;
  mode: GameMode;
  multiplayer: boolean;
  history: { role: "user" | "assistant"; content: string }[];
  title: string;
  emoji: string;
  palette: string[];
}

/** Persists step results (database) or does nothing (browser storage). */
interface Store {
  addUserMessage(content: string, meta: ProjectMessage["meta"]): Promise<void>;
  saveDesign(plan: GamePlan): Promise<void>;
  saveAssets(assets: AssetMap): Promise<AssetMap>;
  saveCode(result: CodeResult, summary: string, message: ProjectMessage["meta"] | null): Promise<void>;
  saveError(message: string): Promise<void>;
}

const noopStore: Store = {
  addUserMessage: async () => undefined,
  saveDesign: async () => undefined,
  saveAssets: async (assets) => assets,
  saveCode: async () => undefined,
  saveError: async () => undefined,
};

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Invalid request" });
  const body = parsed.data;

  if (!isSupabaseConfigured()) {
    if (!body.local) return json(400, { error: "Missing project state" });
    const l = body.local;
    const state: ProjectState = {
      files: projectFiles(l.files, l.html),
      plan: (l.plan as GamePlan | null) ?? null,
      assets: l.assets as AssetMap,
      mode: l.mode,
      multiplayer: l.multiplayer,
      history: l.history,
      title: "",
      emoji: "🎮",
      palette: ["#6d5dfc", "#a78bfa"],
    };
    const model = resolveModel(body.model, "free");
    if (!model) return json(403, { error: "This model is part of Prefly Pro.", code: "plan" });
    return run(body, state, noopStore, model, undefined);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Please sign in.", code: "auth" });

  const { data: project } = await supabase.from("projects").select("*").eq("id", body.projectId).single<Project>();
  if (!project || project.user_id !== user.id) return json(404, { error: "Game not found." });

  const { data: planName } = await supabase.rpc("current_plan");
  const plan: PlanId = user.is_anonymous ? "guest" : planName === "pro" ? "pro" : "free";
  const model = resolveModel(body.model, plan);
  if (!model) return json(403, { error: "This model is part of Prefly Pro.", code: "plan" });

  const files = projectFiles(project.files, project.html);
  const isEdit = body.step === "code" && Object.keys(files).length > 0;
  let remaining: number | undefined;
  if (body.step === "design" || isEdit) {
    const isFix = Boolean(body.runtimeErrors?.length);
    const { data: quota } = await supabase.rpc("consume_generation", { p_kind: body.step === "design" ? "create" : isFix ? "fix" : "edit" });
    const q = quota as { ok: boolean; limit?: number; anonymous?: boolean; remaining?: number; plan?: string } | null;
    if (!q?.ok) {
      return json(429, {
        error: q?.anonymous
          ? `You've used today's ${q.limit} free guest generations. Create a free account to keep building.`
          : q?.plan === "pro"
            ? `Daily limit reached (${q.limit} generations). Try again tomorrow.`
            : `You've used today's ${q?.limit ?? PLAN_LIMITS.free.daily} free generations. Upgrade to Pro for ${PLAN_LIMITS.pro.daily} a day.`,
        code: "quota",
      });
    }
    remaining = q.remaining;
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

  const state: ProjectState = {
    files,
    plan: project.plan,
    assets: project.assets ?? {},
    mode: project.mode,
    multiplayer: project.multiplayer,
    history,
    title: project.title,
    emoji: project.emoji,
    palette: project.palette,
  };

  const store: Store = {
    async addUserMessage(content, meta) {
      await supabase.from("project_messages").insert({ project_id: project.id, role: "user", content, meta });
    },
    async saveDesign(p) {
      await supabase
        .from("projects")
        .update({ plan: p, title: p.title, description: p.tagline, emoji: p.emoji, palette: p.palette, multiplayer: p.multiplayer })
        .eq("id", project.id);
    },
    async saveAssets(assets) {
      // Merge with the latest stored assets (the engineer may have added some meanwhile).
      const { data } = await supabase.from("projects").select("assets").eq("id", project.id).single<{ assets: AssetMap }>();
      const merged = { ...(data?.assets ?? {}), ...assets };
      await supabase.from("projects").update({ assets: merged }).eq("id", project.id);
      return merged;
    },
    async saveCode(result, summary, meta) {
      // Merge assets: the illustrator may have saved sprites while the engineer was working.
      const { data: latest } = await supabase.from("projects").select("assets").eq("id", project.id).single<{ assets: AssetMap }>();
      const assets = { ...(latest?.assets ?? {}), ...result.assets };
      result.assets = assets;
      const { error } = await supabase.from("projects").update({ files: result.files, html: result.html, assets }).eq("id", project.id);
      if (error) throw new Error(error.message);
      await supabase
        .from("project_versions")
        .insert({ project_id: project.id, html: result.html, files: result.files, assets: result.assets, summary: summary.slice(0, 300) });
      // Keep the version history bounded per plan.
      const keep = PLAN_LIMITS[plan].versions;
      const { data: old } = await supabase
        .from("project_versions")
        .select("id")
        .eq("project_id", project.id)
        .order("id", { ascending: false })
        .range(keep, keep + 50);
      if (old?.length) await supabase.from("project_versions").delete().in("id", old.map((v: { id: number }) => v.id));
      if (meta) await supabase.from("project_messages").insert({ project_id: project.id, role: "assistant", content: result.message || "Done.", meta });
    },
    async saveError(message) {
      await supabase.from("project_messages").insert({ project_id: project.id, role: "assistant", content: message, meta: { kind: "error" } });
    },
  };
  return run(body, state, store, model, remaining);
}

function resolveModel(requested: string | undefined, plan: PlanId) {
  const key: ModelKey = isModelKey(requested) ? requested : defaultModel(plan);
  return canUseModel(plan, key) ? MODELS[key] : null;
}

function run(body: BodyT, state: ProjectState, store: Store, model: (typeof MODELS)[ModelKey], remaining: number | undefined): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const step: GenerationStep = body.step;
  const locale: Locale = body.locale;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: GenerationEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true; // client went away — keep working so the result is still saved
        }
      };
      // Keep proxies from closing an idle connection while the model thinks.
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      try {
        const ai = isAnthropicConfigured();
        if (step === "design") {
          await store.addUserMessage(body.prompt, body.image ? { image: true } : {});
          let plan: GamePlan;
          if (ai) {
            plan = await stepDesign({ prompt: body.prompt, mode: state.mode, multiplayer: state.multiplayer, locale, image: body.image, model, emit });
          } else {
            plan = buildTemplateGame(pickTemplate(body.prompt, state.mode), locale).plan;
            emit({ type: "stage", stage: "design", status: "start" });
            emit({ type: "plan", plan });
            emit({ type: "stage", stage: "design", status: "done", detail: plan.title });
          }
          await store.saveDesign(plan);
          emit({ type: "done", step, plan, title: plan.title, emoji: plan.emoji, palette: plan.palette, remaining });
        } else if (step === "graphics") {
          // Not billed separately, so only draw sprites the project doesn't have yet.
          const plan = state.plan ? { ...state.plan, sprites: state.plan.sprites.filter((sp) => !(sp.id in state.assets)) } : null;
          const drawn = ai && plan?.sprites.length ? await stepGraphics({ plan, model, emit }) : {};
          const assets = await store.saveAssets(drawn);
          emit({ type: "done", step, assets });
        } else if (step === "code") {
          const isCreate = !Object.keys(state.files).length;
          const isFix = Boolean(body.runtimeErrors?.length);
          if (!isCreate) {
            await store.addUserMessage(
              isFix ? `Fix ${body.runtimeErrors!.length} error(s) found while play-testing` : body.prompt,
              isFix ? { kind: "fix" } : body.image ? { image: true } : {},
            );
          }
          let result: CodeResult;
          if (ai) {
            result = await stepCode({
              ctx: { files: state.files, plan: state.plan, assets: state.assets, history: state.history },
              prompt: body.prompt,
              plan: state.plan,
              runtimeErrors: body.runtimeErrors,
              locale,
              image: body.image,
              model,
              emit,
            });
          } else if (isCreate) {
            result = demoCode(state, locale, emit);
          } else {
            result = { files: state.files, html: build(state.files).html, assets: state.assets, message: demoEditMessage(locale), issues: [] };
          }
          const agents = (body.agents ?? []).filter((a): a is StageId => ["design", "graphics", "code", "qa", "fix"].includes(a));
          const stepAgents: StageId[] = [...new Set<StageId>([...agents, isFix ? "fix" : "code", "qa"])];
          emit({ type: "stage", stage: "save", status: "start" });
          await store.saveCode(result, result.message || (isFix ? "QA fixes" : "Update"), {
            kind: isFix ? "fix" : undefined,
            issues: result.issues.length,
            agents: stepAgents,
            model: model.key,
          });
          emit({ type: "stage", stage: "save", status: "done" });
          emit({ type: "done", step, files: result.files, html: result.html, assets: result.assets, message: result.message, issues: result.issues.length, remaining });
        } else {
          // repair: recompute static issues server-side; only spend AI time when there are any.
          const { issues } = build(state.files);
          let result: CodeResult = { files: state.files, html: build(state.files).html, assets: state.assets, message: "", issues };
          // Nothing to repair without AI or without issues; report the current state.
          if (ai && issues.length) {
            result = await stepRepair({
              ctx: { files: state.files, plan: state.plan, assets: state.assets, history: state.history },
              issues,
              locale,
              model,
              emit,
            });
            await store.saveCode(result, `QA: fixed ${issues.length} issue(s)`, null);
          }
          emit({ type: "done", step, files: result.files, html: result.html, assets: result.assets, issues: result.issues.length });
        }
      } catch (err) {
        console.error(`generation step ${step} failed`, err);
        const message = errorMessage(err);
        await store.saveError(message).catch(() => undefined);
        emit({ type: "error", message, code: err instanceof AgentError ? err.code : "api" });
      } finally {
        clearInterval(ping);
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

/** Without an Anthropic key, a new project gets the built-in game its design was based on. */
function demoCode(state: ProjectState, locale: Locale, emit: (e: GenerationEvent) => void): CodeResult {
  const id = (state.plan?.genre && state.plan.genre in TEMPLATES ? state.plan.genre : "shooter") as TemplateId;
  const { html } = buildTemplateGame(id, locale);
  const message = demoMessage(id, locale);
  emit({ type: "stage", stage: "code", status: "start" });
  emit({ type: "delta", text: `<message>\n${message}\n</message>\n` });
  emit({ type: "stage", stage: "code", status: "done" });
  return { files: { "index.html": html }, html, assets: {}, message, issues: [] };
}

function errorMessage(err: unknown): string {
  if (err instanceof AgentError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The server's Anthropic API key is invalid.";
  if (err instanceof Anthropic.PermissionDeniedError) return "The server's Anthropic API key doesn't have access to this model.";
  if (err instanceof Anthropic.NotFoundError) return "This AI model isn't available on the server's Anthropic account.";
  if (err instanceof Anthropic.BadRequestError) return `The AI request was rejected: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Please try again.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? "network"}). Please try again.`;
  return "Something went wrong while building your game. Please try again.";
}
