"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { GenerationState } from "@/lib/generation-store";
import { streamingCode, streamingMessage } from "@/lib/ai/response";
import type { StageId } from "@/lib/types";
import { BrainIcon, BugIcon, CheckIcon, CodeIcon, PaletteIcon, SaveIcon, SparklesIcon, SpinnerIcon, WandIcon, XIcon } from "../icons";

const STAGE_ICONS: Record<StageId, typeof CodeIcon> = {
  design: SparklesIcon,
  graphics: PaletteIcon,
  code: CodeIcon,
  qa: BugIcon,
  fix: WandIcon,
  save: SaveIcon,
};

export type TestStatus = { status: "idle" } | { status: "running" } | { status: "passed" } | { status: "failed"; count: number; fixing: boolean };

function useElapsed(since: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live view of the AI agents working on a generation. */
export function AgentProgress({ gen }: { gen: GenerationState }) {
  const { t } = useI18n();
  const running = gen.status === "running";
  const elapsed = useElapsed(gen.startedAt, running);
  const message = streamingMessage(gen.text);
  const code = streamingCode(gen.text);
  const lines = code ? code.split("\n").length : 0;
  const thinkingTail = gen.thinking.trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(-220);
  const activeCode = gen.stages.some((s) => (s.stage === "code" || s.stage === "fix") && s.status === "start");

  return (
    <div className="animate-fade-in rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {running ? <SpinnerIcon size={16} className="text-brand-500" /> : null}
          <span className={running ? "shimmer-text" : ""}>{t("studio.building")}</span>
        </span>
        <span className="text-xs tabular-nums text-ink-muted">{elapsed}</span>
      </div>

      {gen.plan && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-canvas p-3">
          <span className="text-2xl">{gen.plan.emoji}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{gen.plan.title}</p>
            <p className="line-clamp-2 text-xs text-ink-soft">{gen.plan.tagline}</p>
          </div>
        </div>
      )}

      <ol className="mt-3 flex flex-col gap-1.5">
        {gen.stages.map((s, i) => {
          const Icon = STAGE_ICONS[s.stage];
          return (
            <li key={`${s.stage}-${i}`} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  s.status === "done" ? "bg-emerald-50 text-emerald-600" : s.status === "failed" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
                }`}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{t(`stage.${s.stage}` as const)}</span>
                <span className="text-ink-muted"> · {t(`stage.${s.stage}.desc` as const)}</span>
              </span>
              {s.status === "start" ? (
                <SpinnerIcon size={14} className="text-brand-500" />
              ) : s.status === "done" ? (
                <CheckIcon size={15} className="text-emerald-600" />
              ) : (
                <XIcon size={15} className="text-red-500" />
              )}
            </li>
          );
        })}
      </ol>

      {running && activeCode && thinkingTail && !message && (
        <div className="mt-3 flex gap-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">
          <BrainIcon size={14} className="mt-0.5 shrink-0" />
          <p className="line-clamp-3 italic">{thinkingTail}</p>
        </div>
      )}
      {message && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{message}</p>}
      {running && lines > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
          <CodeIcon size={13} /> {t("studio.writingCode")} · {lines} {t("studio.lines")}
        </p>
      )}
    </div>
  );
}

export function TestBadge({ test }: { test: TestStatus }) {
  const { t } = useI18n();
  if (test.status === "idle") return null;
  if (test.status === "running")
    return (
      <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
        <SpinnerIcon size={14} /> {t("studio.testing")}
      </div>
    );
  if (test.status === "passed")
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        <CheckIcon size={14} /> {t("studio.testPassed")}
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <BugIcon size={14} /> {test.fixing ? t("studio.autoFixing", { n: test.count }) : t("studio.errorsFound", { n: test.count })}
    </div>
  );
}

/** Compact record of which agents worked on a reply. */
export function AgentChips({ agents }: { agents: StageId[] }) {
  const { t } = useI18n();
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
      {agents.map((stage) => {
        const Icon = STAGE_ICONS[stage];
        return (
          <span key={stage} className="flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-soft" title={t(`stage.${stage}.desc` as const)}>
            <Icon size={11} /> {t(`stage.${stage}` as const)}
            <CheckIcon size={10} className="text-emerald-600" />
          </span>
        );
      })}
    </div>
  );
}
