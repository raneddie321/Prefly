import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getT } from "@/lib/i18n/server";
import { GameCard } from "@/components/game-card";
import { PlayIcon, SearchIcon, UsersIcon } from "@/components/icons";
import { PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string }> }) {
  const { sort: sortParam, q } = await searchParams;
  const sort = sortParam === "new" ? "new" : "trending";
  const query = (q ?? "").trim().slice(0, 80);
  const { t, locale } = await getT();

  let games: ProjectSummary[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    let request = supabase.from("projects").select(PROJECT_SUMMARY_COLUMNS).eq("is_public", true);
    if (query) request = request.ilike("title", `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    request = sort === "new" ? request.order("published_at", { ascending: false }) : request.order("play_count", { ascending: false }).order("published_at", { ascending: false });
    const { data } = await request.limit(60);
    games = (data ?? []) as ProjectSummary[];
  }
  const nf = new Intl.NumberFormat(locale, { notation: "compact" });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-8 lg:pt-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{t("community.title")}</h1>
      <p className="mt-2 text-ink-soft">{t("community.subtitle")}</p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl bg-white p-1 shadow-card">
          {(["trending", "new"] as const).map((s) => (
            <Link
              key={s}
              href={`/community?sort=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-lg px-4 py-2 text-sm ${sort === s ? "bg-brand-50 font-medium text-brand-600" : "text-ink-soft hover:text-ink"}`}
            >
              {t(s === "trending" ? "community.trending" : "community.new")}
            </Link>
          ))}
        </div>
        <form className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 shadow-card sm:max-w-xs sm:ms-auto" action="/community">
          <input type="hidden" name="sort" value={sort} />
          <SearchIcon size={17} className="text-ink-muted" />
          <input name="q" defaultValue={query} placeholder={t("community.search")} className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </form>
      </div>

      {games.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-line bg-white/60 px-6 py-20 text-center">
          <UsersIcon size={40} className="text-ink-muted" />
          <p className="mt-4 text-ink-soft">{t("community.empty")}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((g) => (
            <GameCard
              key={g.id}
              href={`/play/${g.id}`}
              title={g.title}
              description={g.description}
              emoji={g.emoji}
              palette={g.palette}
              meta={
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <PlayIcon size={11} /> {t("community.plays", { n: nf.format(g.play_count) })}
                  </span>
                  {g.author_name && <span className="truncate">{t("community.by", { name: g.author_name })}</span>}
                  {g.multiplayer && <UsersIcon size={13} />}
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
