import type Anthropic from "@anthropic-ai/sdk";
import type { AssetMap, GameMode, GamePlan, GenerationEvent, ImageInput, Locale, RuntimeError } from "@/lib/types";
import type { ModelInfo } from "@/lib/plans";
import { bundleProject } from "@/lib/runtime/bundle";
import { AgentError } from "./client";
import { designGame, drawAssets, runCoder, userContent } from "./agents";
import { coderSystem, createRequest, editFallbackRequest, editRequest, fixRequest, type EditContext } from "./prompts";
import { applyChanges, parseCoderResponse, type AssetRequest, type FileMap } from "./response";
import { checkProject, describeProblems, type QaIssue } from "./qa";

/**
 * The agent pipeline, split into steps. Each step is a separate HTTP request
 * (driven by the browser), so no single serverless invocation has to fit a
 * whole generation into its time limit:
 *
 *   design  → game designer writes the design document     (new games)
 *   graphics→ illustrator draws the sprites                 (in parallel with code)
 *   code    → engineer writes or edits the project files
 *   repair  → QA fixes for problems found by static checks  (0–2 rounds)
 */

type Emit = (event: GenerationEvent) => void;

export interface CodeResult {
  files: FileMap;
  html: string;
  assets: AssetMap;
  message: string;
  issues: QaIssue[];
}

export async function stepDesign(input: {
  prompt: string;
  mode: GameMode;
  multiplayer: boolean;
  locale: Locale;
  image?: ImageInput;
  model: ModelInfo;
  emit: Emit;
}): Promise<GamePlan> {
  input.emit({ type: "stage", stage: "design", status: "start" });
  const plan = await designGame(input);
  input.emit({ type: "plan", plan });
  input.emit({ type: "stage", stage: "design", status: "done", detail: plan.title });
  return plan;
}

export async function stepGraphics(input: { plan: GamePlan; model: ModelInfo; emit: Emit }): Promise<AssetMap> {
  const { plan, emit } = input;
  if (!plan.sprites.length) return {};
  emit({ type: "stage", stage: "graphics", status: "start", detail: String(plan.sprites.length) });
  try {
    const assets = await drawAssets(plan, plan.sprites, input.model);
    emit({ type: "stage", stage: "graphics", status: "done", detail: String(Object.keys(assets).length) });
    return assets;
  } catch (err) {
    console.error("graphics agent failed", err);
    emit({ type: "stage", stage: "graphics", status: "failed" });
    return {};
  }
}

/** Compiles the project and runs static QA. */
export function build(files: FileMap): { html: string; issues: QaIssue[] } {
  return { html: bundleProject(files).html, issues: checkProject(files) };
}

/** Writes a new project from the design, or applies a chat request / runtime QA report. */
export async function stepCode(input: {
  ctx: EditContext;
  prompt: string;
  plan: GamePlan | null;
  runtimeErrors?: RuntimeError[];
  locale: Locale;
  image?: ImageInput;
  model: ModelInfo;
  emit: Emit;
}): Promise<CodeResult> {
  const { ctx, emit, model } = input;
  const multiplayer = Boolean(input.plan?.multiplayer ?? ctx.plan?.multiplayer);
  const system = coderSystem(input.locale, multiplayer);
  const stream = {
    onText: (text: string) => emit({ type: "delta", text }),
    onThinking: (text: string) => emit({ type: "thinking", text }),
    onReset: () => emit({ type: "reset" }),
  };

  if (!Object.keys(ctx.files).length) {
    if (!input.plan) throw new AgentError("The game has no design yet. Please start a new game.", "format");
    emit({ type: "stage", stage: "code", status: "start" });
    const turn = await runCoder({
      system,
      model,
      messages: [{ role: "user", content: userContent(createRequest(input.prompt, input.plan, input.locale), input.image) }],
      ...stream,
    });
    const parsed = parseCoderResponse(turn.text);
    if (!parsed.files["index.html"]) throw new AgentError("The game engineer didn't return a complete game. Please try again.", "format");
    emit({ type: "stage", stage: "code", status: "done", detail: String(Object.keys(parsed.files).length) });
    const files = parsed.files;
    emit({ type: "stage", stage: "qa", status: "start" });
    const built = build(files);
    emit({ type: "stage", stage: "qa", status: "done", detail: String(built.issues.length) });
    return { files, html: built.html, assets: ctx.assets, message: parsed.message, issues: built.issues };
  }

  const isFix = Boolean(input.runtimeErrors?.length);
  const stage = isFix ? "fix" : "code";
  emit({ type: "stage", stage, status: "start" });
  const request = isFix
    ? fixRequest(ctx, describeProblems(ctx.files, input.runtimeErrors!), "runtime")
    : editRequest(ctx, input.prompt);
  const result = await applyTurn(ctx, system, model, [{ role: "user", content: userContent(request, input.image) }], emit, stream);
  emit({ type: "stage", stage, status: "done" });
  emit({ type: "stage", stage: "qa", status: "start" });
  const built = build(result.files);
  emit({ type: "stage", stage: "qa", status: "done", detail: String(built.issues.length) });
  return { ...result, html: built.html, issues: built.issues };
}

/** One QA repair round for problems found by static checks. */
export async function stepRepair(input: { ctx: EditContext; issues: QaIssue[]; locale: Locale; model: ModelInfo; emit: Emit }): Promise<CodeResult> {
  const { ctx, emit } = input;
  emit({ type: "stage", stage: "fix", status: "start", detail: String(input.issues.length) });
  const system = coderSystem(input.locale, Boolean(ctx.plan?.multiplayer));
  const request = fixRequest(ctx, describeProblems(ctx.files, input.issues), "static");
  const result = await applyTurn(ctx, system, input.model, [{ role: "user", content: request }], emit, {});
  const built = build(result.files);
  emit({ type: "stage", stage: "fix", status: "done", detail: String(built.issues.length) });
  return { ...result, html: built.html, issues: built.issues };
}

/** Runs one engineer turn in edit format; asks for whole files when search blocks don't match. */
async function applyTurn(
  ctx: EditContext,
  system: string,
  model: ModelInfo,
  messages: Anthropic.Beta.BetaMessageParam[],
  emit: Emit,
  stream: { onText?: (t: string) => void; onThinking?: (t: string) => void; onReset?: () => void },
): Promise<{ files: FileMap; assets: AssetMap; message: string }> {
  let turn = await runCoder({ system, model, messages, ...stream });
  let parsed = parseCoderResponse(turn.text);
  let applied = applyChanges(ctx.files, parsed);

  if (applied.failed.length) {
    stream.onReset?.();
    turn = await runCoder({
      system,
      model,
      messages: [
        ...messages,
        { role: "assistant", content: turn.content as Anthropic.Beta.BetaContentBlockParam[] },
        { role: "user", content: editFallbackRequest(applied.failed) },
      ],
      ...stream,
    });
    const retry = parseCoderResponse(turn.text);
    // Keep the edits that did apply the first time, then lay the rewritten files on top.
    const firstPass = applyChanges(ctx.files, { ...parsed, edits: parsed.edits.filter((e) => !applied.failed.includes(e)) });
    applied = applyChanges(firstPass.files, retry);
    if (applied.failed.length && !Object.keys(retry.files).length) {
      throw new AgentError("The game engineer couldn't apply the change. Please try rephrasing.", "format");
    }
    parsed = { ...retry, assetRequests: [...parsed.assetRequests, ...retry.assetRequests] };
  }
  if (!applied.files["index.html"]) applied.files["index.html"] = ctx.files["index.html"] ?? "";

  const assets = await fulfilAssetRequests(ctx, parsed.assetRequests, model, emit);
  return { files: applied.files, assets, message: parsed.message };
}

async function fulfilAssetRequests(ctx: EditContext, requests: AssetRequest[], model: ModelInfo, emit: Emit): Promise<AssetMap> {
  if (!requests.length) return ctx.assets;
  emit({ type: "stage", stage: "graphics", status: "start", detail: String(requests.length) });
  try {
    const plan = {
      title: ctx.plan?.title ?? "Game",
      artDirection: ctx.plan?.artDirection ?? "Match the existing art style.",
      palette: ctx.plan?.palette ?? ["#6d5dfc", "#a78bfa"],
      dimension: ctx.plan?.dimension ?? "2d",
    } as const;
    const drawn = await drawAssets(plan, requests.slice(0, 6), model);
    emit({ type: "stage", stage: "graphics", status: "done", detail: String(Object.keys(drawn).length) });
    return { ...ctx.assets, ...drawn };
  } catch (err) {
    console.error("graphics agent failed", err);
    emit({ type: "stage", stage: "graphics", status: "failed" });
    return ctx.assets;
  }
}

/** Source files of a stored project (older single-file games become { "index.html": html }). */
export function projectFiles(files: FileMap | null | undefined, html: string | null | undefined): FileMap {
  if (files && Object.keys(files).length) return files;
  return html ? { "index.html": html } : {};
}
