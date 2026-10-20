"use client";

import { useSyncExternalStore } from "react";
import { isLocalMode } from "@/lib/data";
import { localStore } from "@/lib/local-store";
import type { ModelKey } from "@/lib/plans";
import type { AssetMap, GamePlan, GenerationEvent, GenerationStep, ImageInput, Locale, RuntimeError, StageId } from "@/lib/types";

/**
 * Client-side orchestrator and store for generations, keyed by project id.
 *
 * A generation is a sequence of short server requests (design → graphics ∥
 * code → QA repair rounds), each streamed as NDJSON. Living outside React
 * means a generation keeps running while the user navigates around the app.
 */

export type StageStatus = "start" | "done" | "failed";

export interface GenerationResult {
  html: string;
  files: Record<string, string>;
  assets: AssetMap;
  message: string;
  title: string;
  emoji: string;
  palette: string[];
  remaining?: number;
}

export interface GenerationState {
  id: number;
  projectId: string;
  kind: "create" | "edit" | "fix";
  prompt: string;
  model: ModelKey | undefined;
  status: "running" | "done" | "error";
  stages: { stage: StageId; status: StageStatus; detail?: string }[];
  plan: GamePlan | null;
  thinking: string;
  text: string;
  error: string | null;
  errorCode: string | null;
  result: GenerationResult | null;
  startedAt: number;
}

export interface StartOptions {
  projectId: string;
  prompt: string;
  locale: Locale;
  kind: GenerationState["kind"];
  model?: ModelKey;
  image?: ImageInput;
  runtimeErrors?: RuntimeError[];
  /** For retrying a new game whose design already exists. */
  existingPlan?: GamePlan | null;
}

const MAX_REPAIR_ROUNDS = 2;
const states = new Map<string, GenerationState>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let nextId = 1;

function notify() {
  for (const l of listeners) l();
}

function update(projectId: string, fn: (s: GenerationState) => GenerationState) {
  const current = states.get(projectId);
  if (!current) return;
  states.set(projectId, fn(current));
  notify();
}

function applyEvent(s: GenerationState, event: GenerationEvent): GenerationState {
  switch (event.type) {
    case "stage": {
      const stages = [...s.stages];
      let index = -1;
      for (let i = stages.length - 1; i >= 0; i--) {
        if (stages[i].stage === event.stage) {
          index = i;
          break;
        }
      }
      const entry = { stage: event.stage, status: event.status, detail: event.detail };
      if (index === -1 || (event.status === "start" && stages[index].status !== "start")) stages.push(entry);
      else stages[index] = entry;
      return { ...s, stages };
    }
    case "plan":
      return { ...s, plan: event.plan };
    case "thinking":
      return { ...s, thinking: (s.thinking + event.text).slice(-6000) };
    case "delta":
      return { ...s, text: s.text + event.text };
    case "reset":
      return { ...s, text: "", thinking: "" };
    default:
      return s;
  }
}

class StepError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

type DoneEvent = Extract<GenerationEvent, { type: "done" }>;

/** Project state the server needs when there's no database. */
function localPayload(projectId: string) {
  if (!isLocalMode()) return undefined;
  const p = localStore.get(projectId);
  if (!p) return undefined;
  const history = p.messages
    .filter((m) => m.meta?.kind !== "error")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  return { files: p.files ?? null, html: p.html, plan: p.plan, assets: p.assets, mode: p.mode, multiplayer: p.multiplayer, history };
}

/** Runs one pipeline step on the server and streams its events into the store. */
async function callStep(step: GenerationStep, options: StartOptions, extra: Record<string, unknown>, signal: AbortSignal): Promise<DoneEvent> {
  const { projectId } = options;
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      step,
      prompt: options.prompt,
      locale: options.locale,
      model: options.model,
      local: localPayload(projectId),
      ...extra,
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new StepError(body.error ?? `Request failed (${response.status})`, body.code ?? null);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pending: GenerationEvent[] = [];
  let scheduled = false;
  let done: DoneEvent | null = null;
  let failure: StepError | null = null;
  const flush = () => {
    scheduled = false;
    const batch = pending;
    pending = [];
    if (batch.length) update(projectId, (s) => batch.reduce(applyEvent, s));
  };

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let event: GenerationEvent;
      try {
        event = JSON.parse(line) as GenerationEvent;
      } catch {
        continue;
      }
      if (event.type === "done") done = event;
      else if (event.type === "error") failure = new StepError(event.message, event.code ?? null);
      else pending.push(event);
    }
    if (pending.length && !scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  }
  flush();
  if (failure) throw failure;
  if (!done) throw new StepError("The connection closed before this step finished.", "network");
  return done;
}

async function orchestrate(options: StartOptions, signal: AbortSignal) {
  const { projectId } = options;
  const local = isLocalMode();
  const fix = Boolean(options.runtimeErrors?.length);
  const agents: StageId[] = [];
  let remaining: number | undefined;

  if (local) {
    localStore.addMessage(projectId, {
      role: "user",
      content: fix ? `Fix ${options.runtimeErrors!.length} error(s) found while play-testing` : options.prompt,
      meta: fix ? { kind: "fix" } : options.image ? { image: true } : {},
    });
  }

  let plan = options.existingPlan ?? null;
  let graphics: Promise<AssetMap | null> = Promise.resolve(null);

  if (options.kind === "create") {
    if (!plan) {
      const design = await callStep("design", options, { image: options.image }, signal);
      plan = design.plan ?? null;
      remaining = design.remaining;
      if (local && plan) {
        localStore.update(projectId, { plan, title: plan.title, description: plan.tagline, emoji: plan.emoji, palette: plan.palette, multiplayer: plan.multiplayer });
      }
    }
    agents.push("design");
    if (plan?.sprites.length) {
      agents.push("graphics");
      graphics = callStep("graphics", options, {}, signal).then(
        (g) => {
          if (local && g.assets) localStore.update(projectId, { assets: { ...(localStore.get(projectId)?.assets ?? {}), ...g.assets } });
          return g.assets ?? null;
        },
        () => null,
      );
    }
  }

  const code = await callStep(
    "code",
    options,
    { image: options.image, runtimeErrors: options.runtimeErrors, agents },
    signal,
  );
  remaining = code.remaining ?? remaining;
  let files = code.files ?? {};
  let html = code.html ?? "";
  let assets = code.assets ?? {};
  const message = code.message ?? "";
  if (local) {
    const merged = { ...(localStore.get(projectId)?.assets ?? {}), ...assets };
    localStore.update(projectId, { files, html, assets: merged });
    localStore.addVersion(projectId, { html, files, assets: merged, summary: message.slice(0, 300) || options.kind });
    localStore.addMessage(projectId, { role: "assistant", content: message || "Done.", meta: { kind: fix ? "fix" : undefined, agents: [...agents, fix ? "fix" : "code", "qa"] } });
  }

  for (let round = 0, issues = code.issues ?? 0; issues > 0 && round < MAX_REPAIR_ROUNDS; round++) {
    const repaired = await callStep("repair", options, {}, signal);
    if (!repaired.files || repaired.issues === undefined || repaired.issues >= issues) break;
    issues = repaired.issues;
    files = repaired.files;
    html = repaired.html ?? html;
    if (local) {
      localStore.update(projectId, { files, html });
      localStore.addVersion(projectId, { html, files, assets, summary: "QA fixes" });
    }
  }

  const drawn = await graphics;
  if (drawn) assets = { ...assets, ...drawn };

  update(projectId, (s) => ({
    ...s,
    status: "done",
    result: {
      html,
      files,
      assets,
      message,
      title: plan?.title ?? "",
      emoji: plan?.emoji ?? "",
      palette: plan?.palette ?? [],
      remaining,
    },
  }));
}

export function startGeneration(options: StartOptions): void {
  if (states.get(options.projectId)?.status === "running") return;
  const controller = new AbortController();
  controllers.set(options.projectId, controller);
  states.set(options.projectId, {
    id: nextId++,
    projectId: options.projectId,
    kind: options.kind,
    prompt: options.prompt,
    model: options.model,
    status: "running",
    stages: [],
    plan: options.existingPlan ?? null,
    thinking: "",
    text: "",
    error: null,
    errorCode: null,
    result: null,
    startedAt: Date.now(),
  });
  notify();
  orchestrate(options, controller.signal)
    .catch((err) => {
      const aborted = controller.signal.aborted;
      const message = aborted ? "Stopped." : err instanceof Error ? err.message : "Network error";
      const code = aborted ? "aborted" : err instanceof StepError ? err.code : "network";
      if (isLocalMode() && !aborted) localStore.addMessage(options.projectId, { role: "assistant", content: message, meta: { kind: "error" } });
      update(options.projectId, (s) => ({ ...s, status: "error", error: message, errorCode: code }));
    })
    .finally(() => controllers.delete(options.projectId));
}

export function stopGeneration(projectId: string) {
  controllers.get(projectId)?.abort();
}

export function clearGeneration(projectId: string) {
  if (states.get(projectId)?.status === "running") return;
  states.delete(projectId);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGeneration(projectId: string): GenerationState | null {
  return useSyncExternalStore(
    subscribe,
    () => states.get(projectId) ?? null,
    () => null,
  );
}

const PENDING_KEY = (id: string) => `prefly:pending:${id}`;

/** Hands a prompt from the home page to the studio across navigation. */
export function setPendingPrompt(projectId: string, payload: { prompt: string; image?: ImageInput; model?: ModelKey }) {
  try {
    sessionStorage.setItem(PENDING_KEY(projectId), JSON.stringify(payload));
  } catch {
    // Storage full or unavailable; the studio will just show an empty project.
  }
}

export function takePendingPrompt(projectId: string): { prompt: string; image?: ImageInput; model?: ModelKey } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY(projectId));
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY(projectId));
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
