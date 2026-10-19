import type Anthropic from "@anthropic-ai/sdk";
import type { AssetMap, GameMode, GamePlan, GenerationEvent, ImageInput, Locale, RuntimeError } from "@/lib/types";
import { AgentError } from "./client";
import { designGame, drawAssets, runCoder, userContent } from "./agents";
import { coderSystem, createRequest, editFallbackRequest, editRequest, fixRequest, type EditContext } from "./prompts";
import { applyEdits, parseCoderResponse, type AssetRequest } from "./response";
import { describeProblems, staticCheck } from "./qa";

type Emit = (event: GenerationEvent) => void;

export interface PipelineResult {
  html: string;
  assets: AssetMap;
  plan: GamePlan | null;
  message: string;
  remainingIssues: number;
}

const MAX_STATIC_FIX_ROUNDS = 2;

/** Builds a new game from a prompt: design -> (graphics ∥ code) -> QA. */
export async function createGame(input: {
  prompt: string;
  mode: GameMode;
  multiplayer: boolean;
  locale: Locale;
  image?: ImageInput;
  emit: Emit;
}): Promise<PipelineResult> {
  const { emit } = input;

  emit({ type: "stage", stage: "design", status: "start" });
  const plan = await designGame(input);
  emit({ type: "plan", plan });
  emit({ type: "stage", stage: "design", status: "done", detail: plan.title });

  // The illustrator works in parallel with the engineer; the engineer only needs sprite ids.
  let assetsPromise: Promise<AssetMap> = Promise.resolve({});
  if (plan.sprites.length) {
    emit({ type: "stage", stage: "graphics", status: "start", detail: String(plan.sprites.length) });
    assetsPromise = drawAssets(plan, plan.sprites).then(
      (assets) => {
        emit({ type: "stage", stage: "graphics", status: "done", detail: String(Object.keys(assets).length) });
        return assets;
      },
      (err) => {
        console.error("graphics agent failed", err);
        emit({ type: "stage", stage: "graphics", status: "failed" });
        return {};
      },
    );
  }

  emit({ type: "stage", stage: "code", status: "start" });
  const system = coderSystem(input.locale, plan.multiplayer);
  const turn = await runCoder({
    system,
    messages: [{ role: "user", content: userContent(createRequest(input.prompt, plan, input.locale), input.image) }],
    onText: (text) => emit({ type: "delta", text }),
    onThinking: (text) => emit({ type: "thinking", text }),
    onReset: () => emit({ type: "reset" }),
  });
  const parsed = parseCoderResponse(turn.text);
  if (!parsed.file) throw new AgentError("The game engineer didn't return a game file. Please try again.", "format");
  emit({ type: "stage", stage: "code", status: "done" });

  const assets = await assetsPromise;
  const qa = await staticQa({ html: parsed.file, plan, assets, history: [] }, system, emit);
  return { html: qa.html, assets: qa.assets, plan, message: parsed.message, remainingIssues: qa.remaining };
}

/** Applies a chat instruction (or a QA report) to an existing game. */
export async function editGame(input: {
  ctx: EditContext;
  instruction?: string;
  runtimeErrors?: RuntimeError[];
  locale: Locale;
  image?: ImageInput;
  emit: Emit;
}): Promise<PipelineResult> {
  const { ctx, emit } = input;
  const system = coderSystem(input.locale, Boolean(ctx.plan?.multiplayer));
  const isFix = Boolean(input.runtimeErrors?.length);
  const stage = isFix ? "fix" : "code";

  emit({ type: "stage", stage, status: "start" });
  const request = isFix
    ? fixRequest(ctx, describeProblems(ctx.html, input.runtimeErrors!), "runtime")
    : editRequest(ctx, input.instruction ?? "");
  const result = await applyCoderTurn(ctx, system, [{ role: "user", content: userContent(request, input.image) }], emit, true);
  emit({ type: "stage", stage, status: "done" });

  const nextCtx = { ...ctx, html: result.html, assets: result.assets };
  const qa = result.changed ? await staticQa(nextCtx, system, emit) : { html: result.html, assets: result.assets, remaining: 0 };
  return { html: qa.html, assets: qa.assets, plan: ctx.plan, message: result.message, remainingIssues: qa.remaining };
}

/**
 * Runs one coder turn in edit format and applies the result. When search
 * blocks don't match, asks once more for the complete file.
 */
async function applyCoderTurn(
  ctx: EditContext,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  emit: Emit,
  streamToClient: boolean,
): Promise<{ html: string; assets: AssetMap; message: string; changed: boolean }> {
  const callbacks = streamToClient
    ? {
        onText: (text: string) => emit({ type: "delta", text }),
        onThinking: (text: string) => emit({ type: "thinking", text }),
        onReset: () => emit({ type: "reset" }),
      }
    : {};

  let turn = await runCoder({ system, messages, ...callbacks });
  let parsed = parseCoderResponse(turn.text);
  let html = ctx.html;

  if (parsed.file) {
    html = parsed.file;
  } else if (parsed.edits.length) {
    const applied = applyEdits(ctx.html, parsed.edits);
    if (applied.failed.length) {
      if (streamToClient) emit({ type: "reset" });
      turn = await runCoder({
        system,
        messages: [
          ...messages,
          { role: "assistant", content: turn.content as Anthropic.Beta.BetaContentBlockParam[] },
          { role: "user", content: editFallbackRequest(applied.failed.length) },
        ],
        ...callbacks,
      });
      const retry = parseCoderResponse(turn.text);
      if (!retry.file) throw new AgentError("The game engineer couldn't apply the change. Please try rephrasing.", "format");
      parsed = { ...retry, assetRequests: [...parsed.assetRequests, ...retry.assetRequests] };
      html = retry.file;
    } else {
      html = applied.result;
    }
  }

  const assets = await fulfilAssetRequests(ctx, parsed.assetRequests, emit);
  const changed = html !== ctx.html || assets !== ctx.assets;
  return { html, assets, message: parsed.message, changed };
}

async function fulfilAssetRequests(ctx: EditContext, requests: AssetRequest[], emit: Emit): Promise<AssetMap> {
  if (!requests.length) return ctx.assets;
  emit({ type: "stage", stage: "graphics", status: "start", detail: String(requests.length) });
  try {
    const plan = {
      title: ctx.plan?.title ?? "Game",
      artDirection: ctx.plan?.artDirection ?? "Match the existing art style.",
      palette: ctx.plan?.palette ?? ["#6d5dfc", "#a78bfa"],
      dimension: ctx.plan?.dimension ?? "2d",
    } as const;
    const drawn = await drawAssets(plan, requests.slice(0, 6));
    emit({ type: "stage", stage: "graphics", status: "done", detail: String(Object.keys(drawn).length) });
    return { ...ctx.assets, ...drawn };
  } catch (err) {
    console.error("graphics agent failed", err);
    emit({ type: "stage", stage: "graphics", status: "failed" });
    return ctx.assets;
  }
}

/** Static checks with up to two automatic fix rounds. */
async function staticQa(
  ctx: EditContext,
  system: string,
  emit: Emit,
): Promise<{ html: string; assets: AssetMap; remaining: number }> {
  emit({ type: "stage", stage: "qa", status: "start" });
  let current = ctx;
  let issues = staticCheck(current.html);
  for (let round = 0; issues.length && round < MAX_STATIC_FIX_ROUNDS; round++) {
    emit({ type: "stage", stage: "fix", status: "start", detail: String(issues.length) });
    try {
      const result = await applyCoderTurn(
        current,
        system,
        [{ role: "user", content: fixRequest(current, describeProblems(current.html, issues), "static") }],
        emit,
        false,
      );
      current = { ...current, html: result.html, assets: result.assets };
    } catch (err) {
      console.error("static fix round failed", err);
      emit({ type: "stage", stage: "fix", status: "failed" });
      break;
    }
    issues = staticCheck(current.html);
    emit({ type: "stage", stage: "fix", status: "done", detail: String(issues.length) });
  }
  emit({ type: "stage", stage: "qa", status: "done", detail: String(issues.length) });
  return { html: current.html, assets: current.assets, remaining: issues.length };
}
