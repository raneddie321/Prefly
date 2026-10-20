"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { canUseModel, MODEL_KEYS, MODELS } from "@/lib/plans";
import { useAuth } from "./auth-provider";
import { CheckIcon, ChevronDownIcon, LockIcon, SparklesIcon } from "./icons";

function Dots({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < value ? color : "bg-line"}`} />
      ))}
    </span>
  );
}

/** Lets the user choose which Claude model builds their game. Pro models are locked on lower plans. */
export function ModelPicker({ compact = false, direction = "down" }: { compact?: boolean; direction?: "up" | "down" }) {
  const { t, locale } = useI18n();
  const { model, setModel, plan, aiEnabled } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS[model];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!aiEnabled) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full border border-line bg-white text-ink-soft transition hover:border-brand-200 hover:text-ink ${compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2.5 text-[0.9rem]"}`}
        aria-expanded={open}
        title={t("model.choose")}
      >
        <SparklesIcon size={compact ? 14 : 17} className="text-brand-500" />
        <span className="whitespace-nowrap">{current.name.replace("Claude ", "")}</span>
        <ChevronDownIcon size={compact ? 12 : 15} />
      </button>
      {open && (
        <div
          className={`absolute start-0 z-30 w-80 animate-fade-in rounded-2xl border border-line bg-white p-1.5 shadow-float ${direction === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("model.choose")}</p>
          {MODEL_KEYS.map((key) => {
            const m = MODELS[key];
            const allowed = canUseModel(plan, key);
            return (
              <button
                type="button"
                key={key}
                onClick={() => {
                  if (!allowed) {
                    router.push(m.plan === "pro" ? "/pricing" : "/login");
                    return;
                  }
                  setModel(key);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-canvas ${allowed ? "" : "opacity-75"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {m.name}
                    {m.plan === "pro" && (
                      <span className="rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 px-1.5 py-0.5 text-[10px] font-bold text-white">PRO</span>
                    )}
                    {m.plan === "free" && plan === "guest" && <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">{t("model.account")}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{m.description[locale]}</span>
                  <span className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-muted">
                    <span className="flex items-center gap-1">
                      {t("model.speed")} <Dots value={m.speed} max={3} color="bg-emerald-400" />
                    </span>
                    <span className="flex items-center gap-1">
                      {t("model.quality")} <Dots value={m.quality} max={4} color="bg-brand-500" />
                    </span>
                  </span>
                </span>
                <span className="mt-0.5 shrink-0">
                  {!allowed ? <LockIcon size={15} className="text-ink-muted" /> : model === key ? <CheckIcon size={16} className="text-brand-500" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
