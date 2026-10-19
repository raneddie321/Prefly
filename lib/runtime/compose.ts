import type { AssetMap, Locale } from "@/lib/types";
import { RUNTIME_SOURCE } from "./runtime-source";

export const SUPABASE_JS_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";

export interface ComposeOptions {
  gameId: string;
  assets?: AssetMap;
  locale?: Locale;
  /** Room code from an invite link. */
  room?: string | null;
  /** Public play URL, used to build multiplayer invite links. */
  playUrl?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  /** Saved localStorage snapshot for this game. */
  storage?: Record<string, string>;
  /** Smoke-test mode: mutes audio and sends synthetic input. */
  test?: boolean;
  testDuration?: number;
}

const RUNTIME_ONE_LINE = RUNTIME_SOURCE.trim().replace(/\n\s*/g, " ");

/** JSON that is safe to embed inside an inline <script>. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Builds the playable document: the game's HTML with the Prefly runtime
 * injected right after the opening <head> tag, on the same line, so line
 * numbers reported by the browser still match the stored game file.
 */
export function composeGame(html: string, options: ComposeOptions): string {
  const assets: Record<string, { svg: string; width: number; height: number; description: string }> = {};
  for (const [id, asset] of Object.entries(options.assets ?? {})) {
    assets[id] = { svg: asset.svg, width: asset.width, height: asset.height, description: asset.description };
  }
  const config = {
    gameId: options.gameId,
    locale: options.locale ?? "en",
    room: options.room ?? null,
    playUrl: options.playUrl ?? "",
    supabaseUrl: options.supabaseUrl ?? "",
    supabaseKey: options.supabaseKey ?? "",
    supabaseJs: options.supabaseUrl ? SUPABASE_JS_CDN : "",
    storage: options.storage ?? {},
    test: Boolean(options.test),
    testDuration: options.testDuration ?? 5000,
    assets,
  };
  const tag = `<script>window.__PREFLY_CONFIG__=${scriptJson(config)};${RUNTIME_ONE_LINE}</script>`;

  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return insertAt(html, head.index + head[0].length, tag);
  const htmlTag = /<html(\s[^>]*)?>/i.exec(html);
  if (htmlTag) return insertAt(html, htmlTag.index + htmlTag[0].length, `<head>${tag}</head>`);
  const doctype = /<!doctype[^>]*>/i.exec(html);
  if (doctype) return insertAt(html, doctype.index + doctype[0].length, tag);
  return tag + html;
}

function insertAt(text: string, index: number, insert: string): string {
  return text.slice(0, index) + insert + text.slice(index);
}
