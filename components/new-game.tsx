"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { createProject } from "@/lib/data";
import { fileToImageInput } from "@/lib/image";
import { setPendingPrompt } from "@/lib/generation-store";
import type { GameMode, ImageInput } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { Mascot } from "./brand";
import { ModelPicker } from "./model-picker";
import { Showcase, StudioAgents } from "./home-sections";
import { ArrowUpIcon, BugIcon, ChevronDownIcon, GamepadIcon, ImageIcon, PaletteIcon, SparklesIcon, SpinnerIcon, TreeIcon, UsersIcon, XIcon, CheckIcon } from "./icons";

export function NewGame() {
  const { t } = useI18n();
  const router = useRouter();
  const { configured, aiEnabled, refreshRecent, model } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<GameMode>("auto");
  const [multiplayer, setMultiplayer] = useState(false);
  const [image, setImage] = useState<(ImageInput & { preview: string }) | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [prompt]);

  async function submit(text = prompt, overrides?: { mode?: GameMode; multiplayer?: boolean }) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    let id: string;
    try {
      id = await createProject({
        title: value.slice(0, 60),
        mode: overrides?.mode ?? mode,
        multiplayer: overrides?.multiplayer ?? multiplayer,
      });
    } catch (err) {
      if (configured && err instanceof Error && /guest session/i.test(err.message)) {
        router.push("/login?next=/");
        return;
      }
      setError(err instanceof Error ? err.message : t("common.error"));
      setBusy(false);
      return;
    }
    setPendingPrompt(id, { prompt: value, image: image ? { mediaType: image.mediaType, data: image.data } : undefined, model });
    void refreshRecent();
    router.push(`/project/${id}`);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setImage(await fileToImageInput(file));
    } catch {
      setError(t("common.error"));
    }
  }

  const modeLabel = mode === "auto" ? t("home.mode") : mode.toUpperCase();
  const suggestions = [
    { icon: GamepadIcon, label: t("home.suggest.racing"), prompt: t("home.suggest.racingPrompt"), mode: "3d" as const, mp: false },
    { icon: TreeIcon, label: t("home.suggest.platformer"), prompt: t("home.suggest.platformerPrompt"), mode: "2d" as const, mp: false },
    { icon: UsersIcon, label: t("home.suggest.multiplayer"), prompt: t("home.suggest.multiplayerPrompt"), mode: "auto" as const, mp: true },
    { icon: SparklesIcon, label: t("home.suggest.shooter"), prompt: t("home.suggest.shooterPrompt"), mode: "2d" as const, mp: false },
    { icon: PaletteIcon, label: t("home.suggest.puzzle"), prompt: t("home.suggest.puzzlePrompt"), mode: "2d" as const, mp: false },
    { icon: BugIcon, label: t("home.suggest.survival"), prompt: t("home.suggest.survivalPrompt"), mode: "3d" as const, mp: false },
  ];

  return (
    <div className="relative overflow-hidden">
      <div className="aurora aurora-animated" />
      <div className="grid-fade pointer-events-none absolute inset-0" />
      <section className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 pb-16 pt-24 sm:px-8">
        <Mascot className="pointer-events-none absolute end-[3%] top-[7%] hidden w-[220px] animate-float md:block xl:end-[7%] xl:w-[260px]" />
        <div className="flex w-full max-w-[880px] flex-col items-center text-center">
          <span className="inline-flex animate-fade-in items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            {t("home.badge")}
          </span>
          <h1 className="mt-6 text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.6rem]">
            <span className="block">{t("home.title1")}</span>
            <span className="text-gradient-animated block pb-1">{t("home.title2")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-ink-soft sm:text-lg">{t("home.subtitle")}</p>
          {!aiEnabled && <p className="mt-5 max-w-xl rounded-2xl border border-brand-100 bg-white/80 px-4 py-2.5 text-sm text-ink-soft">{t("home.demoMode")}</p>}

          <div className="glow-border mt-10 w-full rounded-[24px] p-[1.5px] shadow-float">
            <form
              className="rounded-[22.5px] bg-white p-3 text-start sm:p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {image && (
                <div className="mb-2 ms-2 inline-flex items-center gap-2 rounded-xl border border-line bg-canvas p-1.5 pe-2">
                  <img src={image.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  <button type="button" onClick={() => setImage(null)} className="rounded-md p-1 text-ink-muted hover:bg-black/5" aria-label={t("home.removeImage")}>
                    <XIcon size={16} />
                  </button>
                </div>
              )}
              <textarea
                ref={textRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder={t("home.placeholder")}
                rows={2}
                maxLength={4000}
                className="block w-full resize-none bg-transparent px-2 py-1 text-[1.05rem] text-ink outline-none placeholder:text-ink-muted"
                autoFocus
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl p-2.5 text-ink-soft transition hover:bg-black/5 hover:text-ink"
                  aria-label={t("home.attachImage")}
                  title={t("home.attachImage")}
                >
                  <ImageIcon size={22} />
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                <span className="mx-0.5 h-7 w-px bg-line" />
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2.5 text-[0.9rem] text-ink-soft transition hover:border-brand-200 hover:text-ink"
                    aria-expanded={menuOpen}
                  >
                    <GamepadIcon size={18} />
                    <span>{modeLabel}</span>
                    {multiplayer && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">MP</span>}
                    <ChevronDownIcon size={15} />
                  </button>
                  {menuOpen && (
                    <div className="absolute start-0 top-full z-20 mt-2 w-64 animate-fade-in rounded-2xl border border-line bg-white p-1.5 shadow-float">
                      {(["auto", "2d", "3d"] as const).map((m) => (
                        <button
                          type="button"
                          key={m}
                          onClick={() => setMode(m)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-sm hover:bg-canvas"
                        >
                          {t(m === "auto" ? "home.modeAuto" : m === "2d" ? "home.mode2d" : "home.mode3d")}
                          {mode === m && <CheckIcon size={16} className="text-brand-500" />}
                        </button>
                      ))}
                      <div className="my-1 h-px bg-line" />
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas">
                        <span>
                          <span className="block text-sm">{t("home.multiplayer")}</span>
                          <span className="block text-xs text-ink-muted">{t("home.multiplayerHint")}</span>
                        </span>
                        <input type="checkbox" className="peer sr-only" checked={multiplayer} onChange={(e) => setMultiplayer(e.target.checked)} />
                        <span className="relative h-6 w-10 shrink-0 rounded-full bg-line transition peer-checked:bg-brand-500 after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4" />
                      </label>
                    </div>
                  )}
                </div>
                <ModelPicker />
                <button
                  type="submit"
                  disabled={!prompt.trim() || busy}
                  className="ms-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  aria-label={t("home.send")}
                >
                  {busy ? <SpinnerIcon size={24} /> : <ArrowUpIcon size={26} strokeWidth={2} />}
                </button>
              </div>
            </form>
          </div>
          {busy && <p className="mt-4 text-sm text-ink-soft">{t("home.starting")}</p>}
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map(({ icon: Icon, label, prompt: p, mode: m, mp }) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => {
                  setPrompt(p);
                  setMode(m);
                  setMultiplayer(mp);
                  void submit(p, { mode: m, multiplayer: mp });
                }}
                className="group flex items-center gap-3.5 rounded-2xl border border-line/70 bg-white/90 px-5 py-4 text-start text-[0.98rem] shadow-card backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-float"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-soft transition group-hover:bg-brand-50 group-hover:text-brand-600">
                  <Icon size={22} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <StudioAgents />
      <Showcase />
    </div>
  );
}
