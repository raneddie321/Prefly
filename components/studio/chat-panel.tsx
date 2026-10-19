"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fileToImageInput } from "@/lib/image";
import type { GenerationState } from "@/lib/generation-store";
import type { ImageInput, StageId } from "@/lib/types";
import { LogoMark } from "../brand";
import { AlertIcon, ArrowUpIcon, ImageIcon, StopIcon, WandIcon, XIcon } from "../icons";
import { AgentChips, AgentProgress, TestBadge, type TestStatus } from "./agent-progress";

export interface ChatMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  kind?: "fix" | "error";
  image?: boolean;
  agents?: StageId[];
}

export function ChatPanel({
  messages,
  gen,
  test,
  hasGame,
  remaining,
  onSend,
  onStop,
  onRetry,
}: {
  messages: ChatMessage[];
  gen: GenerationState | null;
  test: TestStatus;
  hasGame: boolean;
  remaining: number | null;
  onSend: (text: string, image?: ImageInput) => void;
  onStop: () => void;
  onRetry: (() => void) | null;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [image, setImage] = useState<(ImageInput & { preview: string }) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const running = gen?.status === "running";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, gen?.text.length, gen?.stages.length, test.status]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  function send(value = text) {
    const v = value.trim();
    if (!v || running) return;
    onSend(v, image ? { mediaType: image.mediaType, data: image.data } : undefined);
    setText("");
    setImage(null);
  }

  const ideas = [t("studio.idea1"), t("studio.idea2"), t("studio.idea3"), t("studio.idea4")];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-thin">
        <div className="flex flex-col gap-4">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.key} className="flex justify-end">
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ee-md px-4 py-2.5 text-[0.93rem] ${
                    m.kind === "fix" ? "bg-amber-50 text-amber-900" : "bg-brand-500 text-white"
                  }`}
                >
                  {m.kind === "fix" ? t("studio.fixRequest") : m.content}
                  {m.image && <ImageIcon size={14} className="ms-1.5 inline opacity-70" />}
                </div>
              </div>
            ) : (
              <div key={m.key} className="flex gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white">
                  <LogoMark size={16} />
                </span>
                <div
                  className={`min-w-0 whitespace-pre-wrap rounded-2xl rounded-ss-md px-4 py-2.5 text-[0.93rem] leading-relaxed ${
                    m.kind === "error" ? "bg-red-50 text-red-800" : "border border-line bg-white"
                  }`}
                >
                  {m.kind === "error" && <AlertIcon size={15} className="me-1.5 inline -translate-y-px" />}
                  {m.content}
                  {m.agents && m.agents.length > 0 && <AgentChips agents={m.agents} />}
                </div>
              </div>
            ),
          )}

          {gen && (gen.status === "running" || gen.status === "done") && <AgentProgress gen={gen} />}
          {gen?.status === "error" && gen.errorCode !== "aborted" && (
            <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                {gen.error}
                {onRetry && (
                  <button onClick={onRetry} className="ms-2 font-medium underline underline-offset-2">
                    {t("studio.retry")}
                  </button>
                )}
              </div>
            </div>
          )}
          <TestBadge test={test} />

          {hasGame && !running && messages.length <= 2 && (
            <div className="mt-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("studio.ideas")}</p>
              <div className="flex flex-wrap gap-2">
                {ideas.map((idea) => (
                  <button key={idea} onClick={() => send(idea)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink-soft hover:border-brand-200 hover:text-ink">
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-white/80 p-3 backdrop-blur">
        {image && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-xl border border-line bg-canvas p-1.5 pe-2">
            <img src={image.preview} alt="" className="h-9 w-9 rounded-lg object-cover" />
            <button onClick={() => setImage(null)} className="rounded-md p-1 text-ink-muted hover:bg-black/5" aria-label={t("home.removeImage")}>
              <XIcon size={14} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 focus-within:border-brand-200">
          <button onClick={() => fileRef.current?.click()} className="rounded-xl p-2 text-ink-soft hover:bg-black/5" aria-label={t("home.attachImage")}>
            <ImageIcon size={20} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setImage(await fileToImageInput(f));
              e.target.value = "";
            }}
          />
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={t("studio.chatPlaceholder")}
            disabled={!hasGame && !running}
            className="max-h-44 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[0.95rem] outline-none placeholder:text-ink-muted"
          />
          {running ? (
            <button onClick={onStop} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white" aria-label={t("studio.stop")}>
              <StopIcon size={18} />
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!text.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40"
              aria-label={t("studio.send")}
            >
              <ArrowUpIcon size={20} strokeWidth={2} />
            </button>
          )}
        </div>
        {remaining !== null && (
          <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-ink-muted">
            <WandIcon size={12} /> {t("studio.remaining", { n: remaining })}
          </p>
        )}
      </div>
    </div>
  );
}
