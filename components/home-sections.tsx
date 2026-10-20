"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { TEMPLATES } from "@/lib/templates";
import { PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { GameCover } from "./brand";
import { BugIcon, CodeIcon, PaletteIcon, PlayIcon, SparklesIcon } from "./icons";

const AGENTS: { icon: typeof CodeIcon; title: MessageKey; body: MessageKey; tint: string }[] = [
  { icon: SparklesIcon, title: "stage.design", body: "home.agent.design", tint: "from-violet-500 to-brand-500" },
  { icon: PaletteIcon, title: "stage.graphics", body: "home.agent.graphics", tint: "from-fuchsia-500 to-pink-500" },
  { icon: CodeIcon, title: "stage.code", body: "home.agent.code", tint: "from-sky-500 to-brand-500" },
  { icon: BugIcon, title: "stage.qa", body: "home.agent.qa", tint: "from-emerald-500 to-teal-500" },
];

export function StudioAgents() {
  const { t } = useI18n();
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">{t("home.agentsTitle")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-ink-soft">{t("home.agentsSubtitle")}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGENTS.map(({ icon: Icon, title, body, tint }, i) => (
          <div key={title} className="relative overflow-hidden rounded-3xl border border-line bg-white/90 p-5 shadow-card backdrop-blur">
            <span className="absolute end-4 top-4 text-xs font-bold text-ink-muted/60">0{i + 1}</span>
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-lg`}>
              <Icon size={22} />
            </span>
            <h3 className="mt-4 font-bold">{t(title)}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(body)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

interface Card {
  id: string;
  title: string;
  description: string;
  emoji: string;
  palette: string[];
  plays?: number;
}

export function Showcase() {
  const { t, locale } = useI18n();
  const [games, setGames] = useState<Card[]>([]);

  useEffect(() => {
    const demos: Card[] = Object.values(TEMPLATES).map((d) => ({
      id: `demo-${d.id}`,
      title: d.title[locale],
      description: d.tagline[locale],
      emoji: d.emoji,
      palette: d.palette,
    }));
    setGames(demos);
    if (!isSupabaseConfigured()) return;
    getSupabase()
      .from("projects")
      .select(PROJECT_SUMMARY_COLUMNS)
      .eq("is_public", true)
      .order("play_count", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        const community = ((data ?? []) as ProjectSummary[]).map((g) => ({ ...g, plays: g.play_count }));
        if (community.length) setGames([...community, ...demos].slice(0, 6));
      });
  }, [locale]);

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("home.showcaseTitle")}</h2>
          <p className="mt-1 text-ink-soft">{t("home.showcaseSubtitle")}</p>
        </div>
        <Link href="/community" className="shrink-0 text-sm font-semibold text-brand-600 hover:underline">
          {t("nav.community")} →
        </Link>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => (
          <Link
            key={g.id}
            href={`/play/${g.id}`}
            className="group overflow-hidden rounded-3xl border border-line bg-white shadow-card transition hover:-translate-y-1 hover:shadow-float"
          >
            <div className="relative">
              <GameCover emoji={g.emoji} palette={g.palette} className="aspect-[16/9] w-full transition duration-500 group-hover:scale-105" />
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-brand-600 shadow-xl">
                  <PlayIcon size={22} className="translate-x-0.5" />
                </span>
              </span>
            </div>
            <div className="p-4">
              <h3 className="truncate font-semibold">{g.title}</h3>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{g.description}</p>
              {g.plays !== undefined && <p className="mt-2 text-xs text-ink-muted">{t("community.plays", { n: g.plays })}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
