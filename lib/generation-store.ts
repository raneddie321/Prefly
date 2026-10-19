"use client";

import { useSyncExternalStore } from "react";
import type { AssetMap, GamePlan, GenerationEvent, ImageInput, Locale, RuntimeError, StageId } from "@/lib/types";

/**
 * Client-side store for in-flight generations, keyed by project id. Living
 * outside React means a generation keeps streaming while the user navigates
 * around the app, and the studio picks it up again when they come back.
 */

export type StageStatus = "start" | "done" | "failed";

export interface GenerationResult {
  html: string;
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
  image?: ImageInput;
  runtimeErrors?: RuntimeError[];
}

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
      // Repeated stages (e.g. several fix rounds) update the latest entry.
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
    case "done":
      return {
        ...s,
        status: "done",
        result: {
          html: event.html,
          assets: event.assets,
          message: event.message,
          title: event.title,
          emoji: event.emoji,
          palette: event.palette,
          remaining: event.remaining,
        },
      };
    case "error":
      return { ...s, status: "error", error: event.message, errorCode: event.code ?? null };
  }
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
    status: "running",
    stages: [],
    plan: null,
    thinking: "",
    text: "",
    error: null,
    errorCode: null,
    result: null,
    startedAt: Date.now(),
  });
  notify();
  void run(options, controller.signal);
}

async function run(options: StartOptions, signal: AbortSignal) {
  const { projectId } = options;
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        prompt: options.prompt,
        locale: options.locale,
        image: options.image,
        runtimeErrors: options.runtimeErrors,
      }),
      signal,
    });
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      update(projectId, (s) => ({ ...s, status: "error", error: body.error ?? `Request failed (${response.status})`, errorCode: body.code ?? null }));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pending: GenerationEvent[] = [];
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const batch = pending;
      pending = [];
      update(projectId, (s) => batch.reduce(applyEvent, s));
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          pending.push(JSON.parse(line) as GenerationEvent);
        } catch {
          // ignore malformed line
        }
      }
      // Batch UI updates to one per animation frame.
      if (pending.length && !scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    }
    if (pending.length) flush();
    update(projectId, (s) =>
      s.status === "running" ? { ...s, status: "error", error: "The connection closed before the game was finished." } : s,
    );
  } catch (err) {
    const aborted = signal.aborted;
    update(projectId, (s) => ({
      ...s,
      status: "error",
      error: aborted ? "Stopped." : err instanceof Error ? err.message : "Network error",
      errorCode: aborted ? "aborted" : "network",
    }));
  } finally {
    controllers.delete(projectId);
  }
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
export function setPendingPrompt(projectId: string, payload: { prompt: string; image?: ImageInput }) {
  try {
    sessionStorage.setItem(PENDING_KEY(projectId), JSON.stringify(payload));
  } catch {
    // Storage full or unavailable; the studio will just show an empty project.
  }
}

export function takePendingPrompt(projectId: string): { prompt: string; image?: ImageInput } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY(projectId));
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY(projectId));
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
