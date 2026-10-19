"use client";

import { useEffect, useRef } from "react";
import type { AssetMap, Locale, RuntimeError } from "@/lib/types";
import { GameFrame } from "../game/game-frame";

const TEST_DURATION = 5000;

/**
 * Play-tests a game in an invisible sandboxed iframe: the runtime mutes audio,
 * presses Play and sends keyboard/pointer input, and every error is collected.
 * The frame stays inside the viewport (just transparent) so browsers don't
 * throttle its animation frames.
 */
export function GameTester({
  gameId,
  html,
  assets,
  locale,
  onResult,
}: {
  gameId: string;
  html: string;
  assets: AssetMap;
  locale: Locale;
  onResult: (errors: RuntimeError[]) => void;
}) {
  const errors = useRef<RuntimeError[]>([]);
  const done = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const finish = useRef(() => {
    if (done.current) return;
    done.current = true;
    onResultRef.current(dedupe(errors.current));
  });

  useEffect(() => {
    // Safety net in case the game hangs before the runtime reports completion.
    const timer = setTimeout(() => finish.current(), TEST_DURATION + 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed bottom-0 end-0 -z-10 h-[360px] w-[640px] max-w-full opacity-0">
      <GameFrame
        gameId={gameId}
        html={html}
        assets={assets}
        locale={locale}
        test
        testDuration={TEST_DURATION}
        className="h-full w-full border-0"
        title="QA play-test"
        onError={(e) => {
          if (!done.current) errors.current.push(e);
        }}
        onTestComplete={() => {
          // Give late errors from the last input a moment to arrive.
          setTimeout(() => finish.current(), 300);
        }}
      />
    </div>
  );
}

export function dedupe(list: RuntimeError[]): RuntimeError[] {
  const seen = new Set<string>();
  const out: RuntimeError[] = [];
  for (const e of list) {
    // Asset warnings and errors from the multiplayer backend aren't code bugs.
    if (e.kind === "resource" && /supabase/.test(e.message)) continue;
    const key = `${e.message}|${e.line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.slice(0, 10);
}
