"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { ensureUser, getSupabase } from "@/lib/supabase/client";
import { fileToImageInput } from "@/lib/image";
import { setPendingPrompt } from "@/lib/generation-store";
import type { GameMode, ImageInput } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { Mascot } from "./brand";
import { ArrowUpIcon, ChevronDownIcon, GamepadIcon, ImageIcon, SpinnerIcon, TreeIcon, UsersIcon, XIcon, CheckIcon } from "./icons";

export function NewGame() {
  const { t } = useI18n();
  const router = useRouter();
  const { configured, refreshRecent } = useAuth();
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
    if (!configured) {
      setError(t("home.notConfigured"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureUser();
    } catch {
      router.push("/login?next=/");
      return;
    }
    const finalMode = overrides?.mode ?? mode;
    const finalMultiplayer = overrides?.multiplayer ?? multiplayer;
    const { data, error: insertError } = await getSupabase()
      .from("projects")
      .insert({ title: value.slice(0, 60), mode: finalMode, multiplayer: finalMultiplayer })
      .select("id")
      .single<{ id: string }>();
    if (insertError || !data) {
      setError(insertError?.message ?? t("common.error"));
      setBusy(false);
      return;
    }
    setPendingPrompt(data.id, { prompt: value, image: image ? { mediaType: image.mediaType, data: image.data } : undefined });
    void refreshRecent();
    router.push(`/project/${data.id}`);
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
  ];

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-20 sm:px-8">
      <div className="aurora" />
      <Mascot className="pointer-events-none absolute end-[4%] top-[9%] hidden w-[230px] animate-float md:block xl:end-[7%] xl:w-[270px]" />

      <section className="relative z-10 flex w-full max-w-[860px] flex-col items-center text-center">
        <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-[4.4rem]">
          <span className="block">{t("home.title1")}</span>
          <span className="text-gradient block pb-1">{t("home.title2")}</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-ink-soft sm:text-lg">{t("home.subtitle")}</p>

        <form
          className="mt-12 w-full rounded-[22px] border border-line bg-white p-3 text-start shadow-float transition focus-within:border-brand-200 sm:p-4"
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
          <div className="mt-3 flex items-center gap-2">
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
            <span className="mx-1 h-7 w-px bg-line" />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[0.95rem] text-ink-soft transition hover:border-brand-200 hover:text-ink"
                aria-expanded={menuOpen}
              >
                <GamepadIcon size={20} />
                <span>{modeLabel}</span>
                {multiplayer && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">MP</span>}
                <ChevronDownIcon size={16} />
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
            <button
              type="submit"
              disabled={!prompt.trim() || busy}
              className="ms-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("home.send")}
            >
              {busy ? <SpinnerIcon size={24} /> : <ArrowUpIcon size={26} strokeWidth={2} />}
            </button>
          </div>
        </form>
        {busy && <p className="mt-4 text-sm text-ink-soft">{t("home.starting")}</p>}
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-12 grid w-full gap-4 sm:grid-cols-3">
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
              className="flex items-center gap-4 rounded-2xl border border-line/70 bg-white px-6 py-5 text-start text-[1.05rem] shadow-card transition hover:-translate-y-0.5 hover:border-brand-200"
            >
              <Icon size={28} className="shrink-0 text-ink-soft" />
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
