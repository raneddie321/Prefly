import type { GameMode, GamePlan, Locale } from "@/lib/types";
import { PLATFORMER } from "./platformer";
import { RACER } from "./racer";
import { SHOOTER } from "./shooter";

/**
 * Built-in demo games. Used when the server has no Anthropic API key, so the
 * site still produces real, playable games — they just aren't AI-generated.
 */
export type TemplateId = "platformer" | "shooter" | "racer";

interface Template {
  id: TemplateId;
  source: string;
  dimension: "2d" | "3d";
  emoji: string;
  palette: string[];
  title: Record<Locale, string>;
  tagline: Record<Locale, string>;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  platformer: {
    id: "platformer",
    source: PLATFORMER,
    dimension: "2d",
    emoji: "🦊",
    palette: ["#7dd3fc", "#c4b5fd", "#fbbf24", "#4ade80"],
    title: { en: "Fox Jumper", he: "השועל הקופץ" },
    tagline: { en: "Run, double-jump and stomp your way through 3 forest levels.", he: "רוצו, קפצו קפיצה כפולה ורמסו אויבים לאורך 3 שלבי יער." },
  },
  shooter: {
    id: "shooter",
    source: SHOOTER,
    dimension: "2d",
    emoji: "🚀",
    palette: ["#1e1b4b", "#a78bfa", "#facc15"],
    title: { en: "Star Blaster", he: "יורה הכוכבים" },
    tagline: { en: "Blast endless enemy waves and grab power-ups.", he: "הפילו גלי אויבים אינסופיים ואספו חיזוקים." },
  },
  racer: {
    id: "racer",
    source: RACER,
    dimension: "3d",
    emoji: "🏎️",
    palette: ["#a5b4fc", "#6d5dfc", "#fbbf24", "#3f7a4a"],
    title: { en: "Turbo Circuit", he: "מעגל הטורבו" },
    tagline: { en: "A 3-lap 3D race against three rivals, with boost pads.", he: "מרוץ תלת-ממדי של 3 הקפות נגד שלושה יריבים, עם משטחי טורבו." },
  },
};

export function pickTemplate(prompt: string, mode: GameMode): TemplateId {
  const p = prompt.toLowerCase();
  if (mode === "3d" || /rac|car|driv|kart|drift|speed|3d|מרוץ|מכונית|מכוניות|נהיג|תלת/.test(p)) return "racer";
  if (/platform|jump|mario|run|level|fox|forest|פלטפורמ|קפיצ|קופץ|שועל|יער|רוץ|ריצה/.test(p)) return "platformer";
  if (/space|shoot|ship|alien|star|laser|חלל|יריות|יורה|חללית|כוכב|לייזר/.test(p)) return "shooter";
  return mode === "2d" ? "platformer" : "shooter";
}

/** JSON safe to embed inside an inline <script>. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildTemplateGame(id: TemplateId, locale: Locale): { html: string; plan: GamePlan } {
  const t = TEMPLATES[id];
  const title = t.title[locale];
  const html = t.source
    .replace("__TITLE__", title.replace(/[<&]/g, ""))
    .replace("__CONFIG__", scriptJson({ title, colors: t.palette }));
  const plan: GamePlan = {
    title,
    tagline: t.tagline[locale],
    emoji: t.emoji,
    palette: t.palette.slice(0, 3),
    dimension: t.dimension,
    multiplayer: false,
    genre: id,
    summary: t.tagline[locale],
    coreLoop: "",
    controls: { desktop: "", touch: "" },
    mechanics: [],
    progression: "",
    artDirection: "",
    audio: "",
    sprites: [],
    techNotes: "",
  };
  return { html, plan };
}

export function demoMessage(id: TemplateId, locale: Locale): string {
  const t = TEMPLATES[id];
  return locale === "he"
    ? `מצב הדגמה: בחרתי את המשחק "${t.title.he}" — ${t.tagline.he} כדי ש-AI יבנה משחק חדש לפי הרעיון שלכם ויערוך אותו בצ'אט, צריך להוסיף מפתח ANTHROPIC_API_KEY.`
    : `Demo mode: here's "${t.title.en}" — ${t.tagline.en} To have AI build a brand-new game from your idea and edit it through chat, add an ANTHROPIC_API_KEY.`;
}

export function demoEditMessage(locale: Locale): string {
  return locale === "he"
    ? "עריכת משחקים בצ'אט דורשת חיבור ל-AI. הוסיפו ANTHROPIC_API_KEY בהגדרות השרת (למשל ב-Vercel → Environment Variables) ואז אוכל לשנות כל דבר במשחק."
    : "Editing games through chat needs the AI connection. Add ANTHROPIC_API_KEY to the server's environment (e.g. Vercel → Environment Variables) and I'll be able to change anything in the game.";
}
