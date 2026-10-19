"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { shareOrCopy } from "@/lib/share";
import type { AssetMap, RuntimeError } from "@/lib/types";
import { GameCover } from "../brand";
import { GameFrame } from "../game/game-frame";
import { BugIcon, CodeIcon, MaximizeIcon, MonitorIcon, PhoneIcon, PlayIcon, RestartIcon, SpinnerIcon, WandIcon } from "../icons";

export interface PreviewGame {
  id: string;
  title: string;
  emoji: string;
  palette: string[];
  html: string | null;
  assets: AssetMap;
}

export function PreviewPanel({
  game,
  busy,
  liveCode,
  playKey,
  playing,
  onPlay,
  onRestart,
  runtimeErrors,
  onRuntimeError,
  onFixErrors,
}: {
  game: PreviewGame;
  busy: boolean;
  liveCode: string;
  playKey: number;
  playing: boolean;
  onPlay: () => void;
  onRestart: () => void;
  runtimeErrors: RuntimeError[];
  onRuntimeError: (e: RuntimeError) => void;
  onFixErrors: () => void;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const stageRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const code = busy && liveCode ? liveCode : (game.html ?? "");
  const codeLines = useMemo(() => code.split("\n"), [code]);

  useEffect(() => {
    if (tab === "code" && busy && codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight;
  }, [code, tab, busy]);

  function fullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  async function share(text: string) {
    const r = await shareOrCopy(text, game.title);
    if (r === "copied") {
      setToast(t("studio.copied"));
      setTimeout(() => setToast(null), 1500);
    }
  }

  const uniqueErrors = runtimeErrors.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="flex rounded-xl bg-canvas p-1">
          {(["preview", "code"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${tab === k ? "bg-white font-medium shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              {k === "preview" ? <PlayIcon size={13} /> : <CodeIcon size={15} />}
              {t(k === "preview" ? "studio.preview" : "studio.code")}
            </button>
          ))}
        </div>
        {tab === "preview" && (
          <div className="hidden rounded-xl bg-canvas p-1 sm:flex">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`rounded-lg p-1.5 transition ${device === d ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
                aria-label={t(d === "desktop" ? "studio.desktop" : "studio.mobile")}
                title={t(d === "desktop" ? "studio.desktop" : "studio.mobile")}
              >
                {d === "desktop" ? <MonitorIcon size={17} /> : <PhoneIcon size={17} />}
              </button>
            ))}
          </div>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          {uniqueErrors > 0 && !busy && (
            <button onClick={onFixErrors} className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">
              <BugIcon size={15} />
              <span className="hidden sm:inline">{t("studio.errorsFound", { n: uniqueErrors })} ·</span>
              <WandIcon size={14} /> {t("studio.fixErrors")}
            </button>
          )}
          {game.html && (
            <>
              <button onClick={onRestart} className="rounded-xl p-2 text-ink-soft hover:bg-black/5 hover:text-ink" title={t("studio.restart")} aria-label={t("studio.restart")}>
                <RestartIcon size={18} />
              </button>
              <button onClick={fullscreen} className="rounded-xl p-2 text-ink-soft hover:bg-black/5 hover:text-ink" title={t("studio.fullscreen")} aria-label={t("studio.fullscreen")}>
                <MaximizeIcon size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {tab === "code" ? (
        <pre ref={codeRef} className="code-view min-h-0 flex-1 overflow-auto bg-[#0f0f1c] py-3 font-mono text-[12.5px] leading-[1.6] text-[#d6d6ef] scrollbar-thin" dir="ltr">
          {code ? (
            codeLines.map((line, i) => (
              <div key={i} className="flex px-3 hover:bg-white/[0.03]">
                <span className="me-4 w-10 shrink-0 select-none text-end text-[#5c5c80]">{i + 1}</span>
                <span className="whitespace-pre">{line || " "}</span>
              </div>
            ))
          ) : (
            <span className="px-4 text-[#5c5c80]">{t("studio.emptyPreview")}</span>
          )}
        </pre>
      ) : (
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_0%,#f1eeff,transparent_60%)] p-3 sm:p-5">
          <div
            ref={stageRef}
            className={`relative overflow-hidden bg-[#0b0b14] shadow-float transition-all ${
              device === "mobile" ? "aspect-[9/19] h-full max-h-[760px] rounded-[2.2rem] border-[10px] border-ink" : "h-full w-full rounded-2xl"
            }`}
          >
            {game.html && playing ? (
              <GameFrame
                key={playKey}
                gameId={game.id}
                html={game.html}
                assets={game.assets}
                locale={locale}
                playUrl={typeof window === "undefined" ? undefined : `${window.location.origin}/play/${game.id}`}
                onError={onRuntimeError}
                onShare={share}
                className="h-full w-full border-0 bg-black"
                title={game.title}
              />
            ) : (
              <button onClick={game.html ? onPlay : undefined} className="group absolute inset-0 flex cursor-default flex-col items-center justify-center" disabled={!game.html}>
                <GameCover emoji={game.emoji} palette={game.palette} className="absolute inset-0 opacity-90" hideEmoji />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                <div className="relative flex flex-col items-center gap-4 px-6 text-center text-white">
                  {game.html ? (
                    <>
                      <span className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-white text-brand-600 shadow-2xl transition group-hover:scale-105">
                        <PlayIcon size={34} className="translate-x-0.5" />
                      </span>
                      <span className="text-xl font-bold drop-shadow">{game.title}</span>
                      <span className="rounded-full bg-white/20 px-4 py-1 text-sm font-medium backdrop-blur">{t("studio.play")}</span>
                    </>
                  ) : (
                    <>
                      {busy ? <SpinnerIcon size={36} /> : null}
                      <span className="text-lg font-semibold drop-shadow">{busy ? t("studio.building") : t("studio.emptyPreview")}</span>
                    </>
                  )}
                </div>
              </button>
            )}
            {busy && game.html && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
                <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
                  <SpinnerIcon size={13} /> {t("studio.building")}
                </span>
              </div>
            )}
            {toast && (
              <div className="absolute inset-x-0 bottom-4 flex justify-center">
                <span className="rounded-full bg-black/75 px-4 py-2 text-sm text-white">{toast}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
