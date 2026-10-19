import type Anthropic from "@anthropic-ai/sdk";
import type { AssetMap, GamePlan, ImageInput, SpriteSpec } from "@/lib/types";
import { AgentError, anthropic, EFFORT, fallbackParams, MODEL } from "./client";
import { ARTIST_SYSTEM, artistRequest, DESIGNER_SYSTEM, designerRequest, PLAN_SCHEMA } from "./prompts";
import { clampSize, parseAttributes, sanitizeAssetId } from "./response";
import type { GameMode, Locale } from "@/lib/types";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;

/** Text of the response. After a server-side fallback, only the fallback model's output counts. */
function textOf(content: ContentBlock[]): string {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  return content
    .slice(lastFallback + 1)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function checkStop(message: Anthropic.Beta.BetaMessage, agent: string) {
  if (message.stop_reason === "refusal") {
    throw new AgentError(`The ${agent} declined this request. Try describing your game differently.`, "refusal");
  }
}

function userContent(text: string, image?: ImageInput): MessageParam["content"] {
  if (!image) return text;
  return [
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
    { type: "text", text },
  ];
}

// ---------------------------------------------------------------------------
// Game designer: idea -> structured design document
// ---------------------------------------------------------------------------

export async function designGame(input: {
  prompt: string;
  mode: GameMode;
  multiplayer: boolean;
  locale: Locale;
  image?: ImageInput;
}): Promise<GamePlan> {
  const response = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...fallbackParams(),
    output_config: { effort: EFFORT.design, format: { type: "json_schema", schema: PLAN_SCHEMA } },
    system: [{ type: "text", text: DESIGNER_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: userContent(designerRequest(input.prompt, input.mode, input.multiplayer, input.locale, Boolean(input.image)), input.image),
      },
    ],
  });
  checkStop(response, "game designer");
  let plan: GamePlan;
  try {
    plan = JSON.parse(textOf(response.content)) as GamePlan;
  } catch {
    throw new AgentError("The game designer returned an unreadable design. Please try again.", "format");
  }
  return normalizePlan(plan, input.mode, input.multiplayer);
}

export function normalizePlan(plan: GamePlan, mode: GameMode, multiplayer: boolean): GamePlan {
  const seen = new Set<string>();
  const sprites: SpriteSpec[] = [];
  for (const s of plan.sprites ?? []) {
    const id = sanitizeAssetId(s.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sprites.push({ id, description: s.description, width: clampSize(s.width), height: clampSize(s.height) });
  }
  const palette = (plan.palette ?? []).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 5);
  return {
    ...plan,
    title: (plan.title || "Untitled game").slice(0, 80),
    emoji: [...(plan.emoji || "🎮")].slice(0, 2).join(""),
    palette: palette.length >= 2 ? palette : ["#6d5dfc", "#a78bfa"],
    dimension: mode === "2d" || mode === "3d" ? mode : plan.dimension === "3d" ? "3d" : "2d",
    multiplayer: multiplayer || Boolean(plan.multiplayer),
    sprites: sprites.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Illustrator: sprite specs -> SVG assets
// ---------------------------------------------------------------------------

const FORBIDDEN_SVG = /<\s*(script|foreignObject|iframe|image|use\b[^>]*href\s*=\s*["']https?:)/i;

export function sanitizeSvg(svg: string, width: number, height: number): string | null {
  let out = svg.trim();
  const start = out.search(/<svg[\s>]/i);
  const end = out.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  out = out.slice(start, end + "</svg>".length);
  if (FORBIDDEN_SVG.test(out)) return null;
  out = out
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(href\s*=\s*["'])(?!#|data:image\/)[^"']*(["'])/gi, "$1#$2")
    .replace(/@import[^;]*;/gi, "");
  // Make sure the root has explicit pixel dimensions so drawImage() can size it.
  out = out.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs;
    if (!/\sxmlns\s*=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"';
    if (!/\sviewBox\s*=/.test(a)) a += ` viewBox="0 0 ${width} ${height}"`;
    a = a.replace(/\swidth\s*=\s*"[^"]*"/, "").replace(/\sheight\s*=\s*"[^"]*"/, "");
    return `<svg${a} width="${width}" height="${height}">`;
  });
  return out;
}

export async function drawAssets(
  plan: Pick<GamePlan, "title" | "artDirection" | "palette" | "dimension">,
  sprites: SpriteSpec[],
): Promise<AssetMap> {
  if (!sprites.length) return {};
  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 48000,
    ...fallbackParams(),
    output_config: { effort: EFFORT.graphics },
    system: [{ type: "text", text: ARTIST_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: artistRequest(plan, sprites) }],
  });
  const response = await stream.finalMessage();
  checkStop(response, "illustrator");
  const text = textOf(response.content);

  const assets: AssetMap = {};
  for (const m of text.matchAll(/<asset\s+([^>]*)>([\s\S]*?)<\/asset>/g)) {
    const id = sanitizeAssetId(parseAttributes(m[1]).id ?? "");
    const spec = sprites.find((s) => s.id === id);
    if (!spec) continue;
    const svg = sanitizeSvg(m[2], spec.width, spec.height);
    if (svg) assets[id] = { ...spec, svg };
  }
  return assets;
}

// ---------------------------------------------------------------------------
// Coder: streams a response in the tagged format (see response.ts)
// ---------------------------------------------------------------------------

export interface CoderTurn {
  text: string;
  content: ContentBlock[];
}

export async function runCoder(input: {
  system: string;
  messages: MessageParam[];
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  /** Called when a fallback model takes over and earlier partial output should be discarded. */
  onReset?: () => void;
}): Promise<CoderTurn> {
  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 100000,
    ...fallbackParams(),
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: EFFORT.code },
    system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
    messages: input.messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_start" && event.content_block.type === "fallback") {
      input.onReset?.();
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") input.onText?.(event.delta.text);
      else if (event.delta.type === "thinking_delta") input.onThinking?.(event.delta.thinking);
    }
  }
  const message = await stream.finalMessage();
  checkStop(message, "game engineer");
  if (message.stop_reason === "max_tokens") {
    throw new AgentError("The game grew too large to finish in one go. Try asking for a smaller change.", "truncated");
  }
  return { text: textOf(message.content), content: message.content };
}

export { userContent };
