"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { composeGame } from "@/lib/runtime/compose";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import type { AssetMap, Locale, RuntimeError } from "@/lib/types";

export interface GameFrameProps {
  gameId: string;
  html: string;
  assets: AssetMap;
  locale: Locale;
  room?: string | null;
  playUrl?: string;
  test?: boolean;
  testDuration?: number;
  className?: string;
  title?: string;
  onError?: (error: RuntimeError) => void;
  onTestComplete?: () => void;
  onShare?: (text: string) => void;
}

export interface GameFrameHandle {
  focus: () => void;
}

const SAVE_KEY = (gameId: string) => `prefly:save:${gameId}`;

function loadSave(gameId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY(gameId)) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Runs a game in a sandboxed iframe. The sandbox has no same-origin access,
 * so games can't touch Prefly's cookies or storage; the runtime talks to this
 * component over postMessage instead.
 */
export const GameFrame = forwardRef<GameFrameHandle, GameFrameProps>(function GameFrame(props, ref) {
  const { gameId, html, assets, locale, room, playUrl, test, testDuration, className, title } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useImperativeHandle(ref, () => ({ focus: () => iframeRef.current?.focus() }), []);

  const srcDoc = useMemo(
    () =>
      composeGame(html, {
        gameId,
        assets,
        locale,
        room,
        playUrl,
        test,
        testDuration,
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_ANON_KEY,
        storage: test ? {} : loadSave(gameId),
      }),
    [html, assets, gameId, locale, room, playUrl, test, testDuration],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string } & Record<string, unknown>;
      if (!data || data.source !== "prefly") return;
      const cb = callbacks.current;
      switch (data.type) {
        case "error":
          cb.onError?.({
            kind: String(data.kind ?? "error"),
            message: String(data.message ?? ""),
            line: Number(data.line) || undefined,
            col: Number(data.col) || undefined,
            stack: data.stack ? String(data.stack) : undefined,
          });
          break;
        case "test-complete":
          cb.onTestComplete?.();
          break;
        case "storage":
          if (!cb.test) {
            try {
              localStorage.setItem(SAVE_KEY(cb.gameId), JSON.stringify(data.data ?? {}));
            } catch {
              // storage full
            }
          }
          break;
        case "share":
          cb.onShare?.(String(data.text ?? ""));
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!test) iframeRef.current?.focus();
  }, [srcDoc, test]);

  return (
    <iframe
      ref={iframeRef}
      title={title ?? "Game"}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-pointer-lock allow-forms allow-popups"
      allow="fullscreen; gamepad; autoplay; accelerometer; gyroscope"
      allowFullScreen
      className={className}
    />
  );
});
