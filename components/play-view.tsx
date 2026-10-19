"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { remixProject } from "@/lib/remix";
import { shareOrCopy } from "@/lib/share";
import type { Project } from "@/lib/types";
import { GameCover, LogoMark } from "./brand";
import { GameFrame } from "./game/game-frame";
import { MaximizeIcon, PencilIcon, PlayIcon, ShareIcon, SpinnerIcon, WandIcon } from "./icons";

type PlayGame = Pick<Project, "id" | "title" | "description" | "emoji" | "palette" | "html" | "assets" | "is_public" | "author_name" | "play_count" | "multiplayer">;

export function PlayView({ game, room, isOwner }: { game: PlayGame; room: string | null; isOwner: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [remixing, setRemixing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const counted = useRef(false);

  // Invite links drop players straight into the game.
  useEffect(() => {
    if (room) setPlaying(true);
  }, [room]);

  useEffect(() => {
    if (!playing || counted.current || !game.is_public) return;
    counted.current = true;
    const key = `prefly:played:${game.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    getSupabase().rpc("increment_play_count", { p_project_id: game.id }).then(() => undefined);
  }, [playing, game.id, game.is_public]);

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 1600);
  }

  async function share(text?: string) {
    const result = await shareOrCopy(text || window.location.href.split("?")[0], game.title);
    if (result === "copied") flash(t("studio.copied"));
  }

  async function remix() {
    setRemixing(true);
    try {
      const id = await remixProject(game.id, "(remix)");
      router.push(`/project/${id}`);
    } catch {
      setRemixing(false);
      router.push(`/login?next=/play/${game.id}`);
    }
  }

  function fullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  return (
    <div className="flex h-dvh flex-col bg-[#0b0b14]">
      <header className="flex items-center gap-3 bg-white px-3 py-2 sm:px-4">
        <Link href="/" aria-label="Prefly" className="shrink-0">
          <LogoMark size={28} />
        </Link>
        <span className="text-xl leading-none">{game.emoji}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[0.95rem] font-semibold leading-tight">{game.title}</h1>
          {game.author_name && <p className="truncate text-xs text-ink-muted">{t("community.by", { name: game.author_name })}</p>}
        </div>
        {isOwner && (
          <Link href={`/project/${game.id}`} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-black/5">
            <PencilIcon size={16} /> <span className="hidden sm:inline">Studio</span>
          </Link>
        )}
        <button onClick={fullscreen} className="rounded-xl p-2 text-ink-soft hover:bg-black/5" aria-label={t("studio.fullscreen")}>
          <MaximizeIcon size={18} />
        </button>
        {game.is_public && (
          <button onClick={() => share()} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-black/5">
            <ShareIcon size={17} /> <span className="hidden sm:inline">{t("play.share")}</span>
          </button>
        )}
        <button
          onClick={remix}
          disabled={remixing}
          className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {remixing ? <SpinnerIcon size={16} /> : <WandIcon size={16} />}
          {t("play.remix")}
        </button>
      </header>
      {!game.is_public && <p className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">{t("play.private")}</p>}

      <div ref={stageRef} className="relative min-h-0 flex-1 bg-black">
        {playing ? (
          <GameFrame
            gameId={game.id}
            html={game.html ?? ""}
            assets={game.assets}
            locale={locale}
            room={room}
            playUrl={typeof window === "undefined" ? undefined : `${window.location.origin}/play/${game.id}`}
            onShare={(text) => share(text)}
            className="h-full w-full border-0"
            title={game.title}
          />
        ) : (
          <button onClick={() => setPlaying(true)} className="group absolute inset-0 flex flex-col items-center justify-center">
            <GameCover emoji={game.emoji} palette={game.palette} className="absolute inset-0" hideEmoji />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="relative flex max-w-lg flex-col items-center gap-4 px-6 text-center text-white">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-brand-600 shadow-2xl transition group-hover:scale-105">
                <PlayIcon size={40} className="translate-x-0.5" />
              </span>
              <span className="text-2xl font-extrabold drop-shadow sm:text-3xl">{game.title}</span>
              {game.description && <span className="text-sm text-white/85 drop-shadow">{game.description}</span>}
              <span className="rounded-full bg-white/20 px-5 py-1.5 text-sm font-medium backdrop-blur">{t("play.tapToPlay")}</span>
            </div>
          </button>
        )}
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
            <span className="rounded-full bg-black/75 px-4 py-2 text-sm text-white">{toast}</span>
          </div>
        )}
      </div>
    </div>
  );
}
